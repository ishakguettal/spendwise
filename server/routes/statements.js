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

    // Return cached result if this exact PDF was processed before
    const cached = db.prepare('SELECT * FROM statements WHERE hash = ?').get(hash);
    if (cached?.autopsy_json) {
      const autopsy = JSON.parse(cached.autopsy_json);
      const transactions = db.prepare('SELECT * FROM transactions WHERE statement_id = ?').all(cached.id);
      return res.json({ transactions, autopsy, cached: true });
    }

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

    const cached = db.prepare('SELECT * FROM statements WHERE hash = ?').get(hash);
    if (cached?.autopsy_json) {
      const autopsy = JSON.parse(cached.autopsy_json);
      const transactions = db.prepare('SELECT * FROM transactions WHERE statement_id = ?').all(cached.id);
      return res.json({ transactions, autopsy, cached: true });
    }

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

  // ── Save statement record (autopsy populated after) ───────────────────────
  const stmtResult = db.prepare(
    'INSERT INTO statements (filename, hash) VALUES (?, ?)'
  ).run(filename, hash);
  const statementId = stmtResult.lastInsertRowid;

  // ── Prompt 1: extract transactions ────────────────────────────────────────
  let parsedTransactions;
  try {
    parsedTransactions = await parseStatement(text);
  } catch (err) {
    db.prepare('DELETE FROM statements WHERE id = ?').run(statementId);
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

  // ── Prompt 2: autopsy ─────────────────────────────────────────────────────
  // Convert tx amounts to display_currency before sending to LLM
  const { display_currency: dispCur } = db.prepare('SELECT display_currency FROM user_settings WHERE id=1').get() ?? { display_currency: 'AED' };
  const dispRate = await getRate('AED', dispCur);

  const autopsyTxs = insertedTransactions.map(tx => ({
    ...tx,
    amount: tx.amount * dispRate,
  }));

  let autopsy = null;
  try {
    autopsy = await autopsyStatement(text, autopsyTxs, dispCur);
    db.prepare('UPDATE statements SET autopsy_json = ? WHERE id = ?')
      .run(JSON.stringify(autopsy), statementId);
  } catch (err) {
    // Non-fatal — transactions are already saved; autopsy is a bonus
    const kind = err.message.includes('timeout') ? 'timeout'
      : err.message.includes('parse') ? 'parse error'
      : 'unknown error';
    console.error(`[statements/upload] Prompt 2 (autopsyStatement) failed — ${kind}:`, err.message);
  }

  res.status(201).json({ transactions: insertedTransactions, autopsy, cached: false });
});

export default router;
