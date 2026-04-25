import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { PDFParse } from 'pdf-parse';
import db from '../db/database.js';
import { VALID_CATEGORIES, VALID_CURRENCIES } from './transactions.js';
import { invalidateInsightsCache } from '../helpers/invalidateInsightsCache.js';
import { parseStatement } from '../prompts/parseStatement.js';
import { autopsyStatement } from '../prompts/autopsy.js';
import { sanitizeStatementText } from '../lib/sanitizeStatementText.js';
import { convert, getRate } from '../lib/exchangeRates.js';

const router = Router();

const MONTH_RE = /^\d{4}-\d{2}$/;

// Tracks statement IDs currently being autopsy-generated so concurrent
// triggers (upload background task + GET /autopsy) don't double-run.
const generatingAutopsy = new Set();

async function runAutopsyInBackground(statementId, month) {
  if (generatingAutopsy.has(statementId)) return;
  generatingAutopsy.add(statementId);
  try {
    const txRows = db.prepare('SELECT * FROM transactions WHERE statement_id = ?').all(statementId);
    const { display_currency: dispCur } = db.prepare('SELECT display_currency FROM user_settings WHERE id=1').get() ?? { display_currency: 'AED' };
    const dispRate = await getRate('AED', dispCur);
    const autopsyTxs = txRows.map(tx => ({ ...tx, amount: tx.amount * dispRate }));
    const autopsy = await autopsyStatement('', autopsyTxs, dispCur);
    db.prepare('UPDATE statements SET autopsy_json = ? WHERE id = ?').run(JSON.stringify(autopsy), statementId);
  } catch (err) {
    const kind = err.message.includes('timeout') ? 'timeout'
      : err.message.includes('parse') ? 'parse error'
      : 'unknown error';
    console.error(`[autopsy regen] background generation failed for ${month} — ${kind}:`, err.message);
  } finally {
    generatingAutopsy.delete(statementId);
  }
}

// GET /api/statements/autopsy?month=YYYY-MM
// Returns the stored autopsy for that month, or triggers background generation
// if a statement exists for that month but autopsy is missing.
router.get('/autopsy', (req, res) => {
  const { month } = req.query;
  if (!month || !MONTH_RE.test(month))
    return res.status(400).json({ error: 'month query param required in YYYY-MM format' });

  // Check for a completed autopsy first
  const done = db.prepare(`
    SELECT s.autopsy_json
    FROM   statements s
    WHERE  s.autopsy_json IS NOT NULL
      AND  EXISTS (
             SELECT 1 FROM transactions t
             WHERE  t.statement_id = s.id
               AND  t.date LIKE ?
           )
    ORDER  BY s.uploaded_at DESC
    LIMIT  1
  `).get(`${month}-%`);

  if (done) return res.json({ autopsy: JSON.parse(done.autopsy_json) });

  // No autopsy — check for a statement whose autopsy is missing or in-flight
  const pending = db.prepare(`
    SELECT s.id
    FROM   statements s
    WHERE  s.autopsy_json IS NULL
      AND  EXISTS (
             SELECT 1 FROM transactions t
             WHERE  t.statement_id = s.id
               AND  t.date LIKE ?
           )
    ORDER  BY s.uploaded_at DESC
    LIMIT  1
  `).get(`${month}-%`);

  if (!pending) return res.json({ autopsy: null });

  // Statement exists but autopsy failed or hasn't run yet — regenerate
  res.json({ autopsy: null, generating: true });
  runAutopsyInBackground(pending.id, month);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  },
});

// Conditionally run multer only for multipart/form-data requests
function conditionalUpload(req, res, next) {
  if (req.is('multipart/form-data')) {
    upload.single('file')(req, res, next);
  } else {
    next();
  }
}

// POST /api/statements/upload
// Accepts: multipart with "file" field (PDF) OR JSON body with "text" field
router.post('/upload', conditionalUpload, async (req, res) => {
  let text = '';
  let hash = '';
  let filename = 'paste';

  if (req.file) {
    // ── PDF upload path ──────────────────────────────────────────────────────
    filename = req.file.originalname;
    hash = createHash('sha256').update(req.file.buffer).digest('hex');

    // Extract text from PDF
    try {
      const parser = new PDFParse({ data: req.file.buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      text = parsed.text ?? '';
    } catch {
      return res.status(422).json({
        error: 'Could not parse the PDF. Try pasting the statement text instead.',
        fallback: 'paste_text',
      });
    }

    if (text.trim().length < 50) {
      return res.status(422).json({
        error: 'PDF appears to be empty or image-based and cannot be read. Paste the text instead.',
        fallback: 'paste_text',
      });
    }

    // Sanitize before anything leaves this server
    { const { cleaned_text, ...report } = sanitizeStatementText(text);
      console.log('[sanitize] PDF:', report);
      text = cleaned_text; }

  } else if (req.body?.text) {
    // ── Paste text path ──────────────────────────────────────────────────────
    text = req.body.text;
    hash = createHash('sha256').update(text).digest('hex');

    if (text.trim().length < 50) {
      return res.status(400).json({ error: 'Text is too short to process.' });
    }

    // Sanitize before anything leaves this server
    { const { cleaned_text, ...report } = sanitizeStatementText(text);
      console.log('[sanitize] paste:', report);
      text = cleaned_text; }
  } else {
    return res.status(400).json({ error: 'Provide a PDF file or a text body.' });
  }

  // ── Save statement record — reuse and reset if this hash was uploaded before ─
  let statementId;
  let isNewStatement = false;
  const existing = db.prepare('SELECT id FROM statements WHERE hash = ?').get(hash);
  if (existing) {
    // Invalidate insights cache for every month this statement had transactions in
    const oldDates = db.prepare('SELECT DISTINCT date FROM transactions WHERE statement_id = ?').all(existing.id);
    for (const { date } of oldDates) invalidateInsightsCache(date);
    db.prepare('DELETE FROM transactions WHERE statement_id = ?').run(existing.id);
    db.prepare('UPDATE statements SET autopsy_json = NULL, filename = ? WHERE id = ?').run(filename, existing.id);
    statementId = existing.id;
  } else {
    const stmtResult = db.prepare('INSERT INTO statements (filename, hash) VALUES (?, ?)').run(filename, hash);
    statementId = stmtResult.lastInsertRowid;
    isNewStatement = true;
  }

  // ── Prompt 1: extract transactions ────────────────────────────────────────
  let parsedTransactions;
  try {
    parsedTransactions = await parseStatement(text);
  } catch (err) {
    if (isNewStatement) db.prepare('DELETE FROM statements WHERE id = ?').run(statementId);
    const kind = err.message.includes('timeout') ? 'timeout'
      : err.message.includes('parse') ? 'parse error'
      : err.message.includes('valid') ? 'validation error'
      : 'unknown error';
    console.error(`[statements/upload] Prompt 1 (parseStatement) failed — ${kind}:`, err.message);
    return res.status(422).json({
      error: 'Could not extract transactions from the text. Try a cleaner paste.',
      fallback: 'paste_text',
    });
  }

  // ── Insert transactions with source='statement' ───────────────────────────
  // Each parsed tx may have its own currency; normalize to AED for storage.
  const insertStmt = db.prepare(
    `INSERT INTO transactions (type, category, amount, date, description, source, statement_id, currency, original_amount)
     VALUES (?, ?, ?, ?, ?, 'statement', ?, ?, ?)`
  );

  const insertedTransactions = [];

  // Pre-compute AED amounts for all transactions (may need async getRate)
  const txsWithAed = await Promise.all(parsedTransactions.map(async (tx) => {
    const currency = VALID_CURRENCIES.includes(tx.currency) ? tx.currency : 'AED';
    const original_amount = tx.amount;
    const aed_amount = currency !== 'AED' ? await convert(tx.amount, currency, 'AED') : tx.amount;
    return { ...tx, currency, original_amount, aed_amount };
  }));

  db.transaction(() => {
    for (const tx of txsWithAed) {
      const result = insertStmt.run(
        tx.type, tx.category, tx.aed_amount, tx.date, tx.description ?? null,
        statementId, tx.currency, tx.original_amount
      );
      insertedTransactions.push(
        db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid)
      );
      invalidateInsightsCache(tx.date);
    }
  })();

  // ── Respond immediately — autopsy runs in the background ────────────────
  res.status(201).json({ transactions: insertedTransactions, cached: false });

  // ── Prompt 2: autopsy (fire-and-forget) ───────────────────────────────────
  // Use the shared runAutopsyInBackground so a concurrent GET /autopsy poll
  // won't spawn a second generation for the same statement.
  const uploadMonth = insertedTransactions[0]?.date?.slice(0, 7) ?? '';
  runAutopsyInBackground(statementId, uploadMonth);
});

export default router;
