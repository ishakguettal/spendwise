import { Router } from 'express';
import db from '../db/database.js';
import { invalidateInsightsCache } from '../helpers/invalidateInsightsCache.js';
import { categorizeTransaction } from '../prompts/categorize.js';

const router = Router();

export const VALID_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Rent', 'Bills', 'Subscriptions',
  'Entertainment', 'Shopping', 'Health', 'Education', 'Travel',
  'Income', 'Savings', 'Other',
];

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

  // Savings type always gets 'Savings', regardless of what was sent
  if (type === 'savings') {
    category = 'Savings';
  }
  // Auto-categorize with Gemini if category is absent or empty
  else if (!category) {
    category = await categorizeTransaction({ description, amount, type });
  }
  // User provided a category — keep it (validateFields will reject if invalid)

  const errors = validateFields({ type, amount, date, category });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const result = db.prepare(
    `INSERT INTO transactions (type, category, amount, date, description, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(type, category, amount, date, description ?? null, source ?? 'manual');

  invalidateInsightsCache(date);

  const created = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/transactions/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const type        = req.body.type        ?? existing.type;
  const amount      = req.body.amount      ?? existing.amount;
  const date        = req.body.date        ?? existing.date;
  const description = req.body.description !== undefined ? req.body.description : existing.description;
  const category    = req.body.category    ?? existing.category;

  const errors = validateFields({ type, amount, date, category });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  db.prepare(
    `UPDATE transactions SET type=?, category=?, amount=?, date=?, description=? WHERE id=?`
  ).run(type, category, amount, date, description, existing.id);

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
