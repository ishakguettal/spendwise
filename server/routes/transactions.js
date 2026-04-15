import { Router } from 'express';
import db from '../db/database.js';
import { invalidateInsightsCache } from '../helpers/invalidateInsightsCache.js';
import { categorizeTransaction } from '../prompts/categorize.js';
import { convert } from '../lib/exchangeRates.js';

const router = Router();

export const VALID_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Rent', 'Bills', 'Subscriptions',
  'Entertainment', 'Shopping', 'Health', 'Education', 'Travel',
  'Income', 'Savings', 'Other',
];

export const VALID_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP'];

const VALID_TYPES = ['income', 'expense', 'savings'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateFields({ type, amount, date, category }) {
  const errors = [];
  if (type !== undefined && !VALID_TYPES.includes(type))
    errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
  if (amount !== undefined && (typeof amount !== 'number' || amount <= 0))
    errors.push('amount must be a positive number');
  if (date !== undefined && !DATE_RE.test(date))
    errors.push('date must be YYYY-MM-DD');
  if (category !== undefined && !VALID_CATEGORIES.includes(category))
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  return errors;
}

// GET /api/transactions/any — lightweight global existence check (no month filter)
router.get('/any', (req, res) => {
  const row = db.prepare('SELECT 1 FROM transactions LIMIT 1').get();
  res.json({ exists: !!row });
});

// GET /api/transactions?month=YYYY-MM&type=&category=
router.get('/', (req, res) => {
  const { month, type, category } = req.query;

  let sql = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];

  if (month)    { sql += ' AND date LIKE ?';     params.push(`${month}-%`); }
  if (type)     { sql += ' AND type = ?';        params.push(type); }
  if (category) { sql += ' AND category = ?';    params.push(category); }

  sql += ' ORDER BY date DESC';

  res.json(db.prepare(sql).all(...params));
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const { type, amount, date, description, source } = req.body;
  let { category } = req.body;

  // Validate type up front — missing/invalid type is a 400, never a crash
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type is required and must be one of: ${VALID_TYPES.join(', ')}` });
  }

  // Currency handling: default to AED; reject unknown currencies
  const currency = req.body.currency ?? 'AED';
  if (!VALID_CURRENCIES.includes(currency))
    return res.status(400).json({ error: `currency must be one of: ${VALID_CURRENCIES.join(', ')}` });

  // Savings type always gets 'Savings', regardless of what was sent
  if (type === 'savings') {
    category = 'Savings';
  }
  // Auto-categorize with Gemini if category is absent or empty
  else if (!category) {
    try {
      category = await categorizeTransaction({ description, amount, type });
    } catch (err) {
      console.error('[POST /transactions] categorize threw unexpectedly:', err.message);
    }
    // Guarantee a valid category even if the LLM call produced nothing usable
    if (!category || !VALID_CATEGORIES.includes(category)) {
      category = 'Other';
    }
  }

  const errors = validateFields({ type, amount, date, category });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  // Normalize to AED for storage; keep original for display
  const original_amount = amount;
  const aed_amount = currency !== 'AED' ? await convert(amount, currency, 'AED') : amount;

  const result = db.prepare(
    `INSERT INTO transactions (type, category, amount, date, description, source, currency, original_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(type, category, aed_amount, date, description ?? null, source ?? 'manual', currency, original_amount);

  invalidateInsightsCache(date);

  const created = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const type        = req.body.type        ?? existing.type;
  const date        = req.body.date        ?? existing.date;
  const description = req.body.description !== undefined ? req.body.description : existing.description;
  const category    = req.body.category    ?? existing.category;

  // Currency/amount update: recalculate AED amount if either field changes
  const currency        = VALID_CURRENCIES.includes(req.body.currency) ? req.body.currency : (existing.currency ?? 'AED');
  const original_amount = req.body.amount !== undefined ? req.body.amount : (existing.original_amount ?? existing.amount);
  let   aed_amount;
  if (req.body.amount !== undefined || req.body.currency !== undefined) {
    aed_amount = currency !== 'AED' ? await convert(original_amount, currency, 'AED') : original_amount;
  } else {
    aed_amount = existing.amount; // unchanged
  }

  const errors = validateFields({ type, amount: aed_amount, date, category });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  db.prepare(
    `UPDATE transactions SET type=?, category=?, amount=?, date=?, description=?, currency=?, original_amount=? WHERE id=?`
  ).run(type, category, aed_amount, date, description, currency, original_amount, existing.id);

  invalidateInsightsCache(existing.date);
  if (date !== existing.date) invalidateInsightsCache(date);

  res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(existing.id));
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  db.prepare('DELETE FROM transactions WHERE id = ?').run(existing.id);
  invalidateInsightsCache(existing.date);
  res.status(204).send();
});

export default router;
