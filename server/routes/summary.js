import { Router } from 'express';
import db from '../db/database.js';
import { getRate } from '../lib/exchangeRates.js';

const router = Router();

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Build an array of `count` consecutive months ending with (and including) `endMonth`.
 * e.g. getPreviousMonths('2026-04', 6) → ['2025-11','2025-12','2026-01','2026-02','2026-03','2026-04']
 */
function getPreviousMonths(endMonth, count) {
  const [y, m] = endMonth.split('-').map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    let mo = m - i;
    let yr = y;
    while (mo <= 0) { mo += 12; yr--; }
    months.push(`${yr}-${String(mo).padStart(2, '0')}`);
  }
  return months;
}

// GET /api/summary?month=YYYY-MM
router.get('/', async (req, res) => {
  const { month } = req.query;
  if (!month || !MONTH_RE.test(month))
    return res.status(400).json({ error: 'month query param required in YYYY-MM format' });

  const pat = `${month}-%`;

  const { income } = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS income FROM transactions WHERE type='income' AND date LIKE ?`
  ).get(pat);

  const { expenses } = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS expenses FROM transactions WHERE type='expense' AND date LIKE ?`
  ).get(pat);

  const { savings_added } = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS savings_added FROM transactions WHERE type='savings' AND date LIKE ?`
  ).get(pat);

  // net = income − expenses; savings is neutral and excluded (per spec)
  const net = income - expenses;

  // Spending breakdown by category (expenses only)
  const by_category = db.prepare(
    `SELECT category, COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE type='expense' AND date LIKE ?
     GROUP BY category
     ORDER BY total DESC`
  ).all(pat);

  // 6-month trend ending with the requested month
  const trend_6mo = getPreviousMonths(month, 6).map(mo => {
    const p = `${mo}-%`;
    const { income: inc } = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS income FROM transactions WHERE type='income' AND date LIKE ?`
    ).get(p);
    const { expenses: exp } = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS expenses FROM transactions WHERE type='expense' AND date LIKE ?`
    ).get(p);
    return { month: mo, income: inc, expenses: exp };
  });

  // Convert all totals to display_currency at the response boundary
  const { display_currency } = db.prepare('SELECT display_currency FROM user_settings WHERE id=1').get() ?? { display_currency: 'AED' };
  const rate = await getRate('AED', display_currency);

  const scale = (n) => n * rate;

  res.json({
    income:       scale(income),
    expenses:     scale(expenses),
    net:          scale(net),
    savings_added: scale(savings_added),
    by_category:  by_category.map(c => ({ ...c, total: scale(c.total) })),
    trend_6mo:    trend_6mo.map(t => ({ ...t, income: scale(t.income), expenses: scale(t.expenses) })),
    display_currency,
    aed_to_display_rate: rate,
  });
});

export default router;
