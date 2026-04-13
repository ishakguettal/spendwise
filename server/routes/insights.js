import { Router } from 'express';
import db from '../db/database.js';
import { generateInsights } from '../prompts/insights.js';

const router = Router();

const MONTH_RE = /^\d{4}-\d{2}$/;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Build an array of `count` consecutive months ending with (and including) `endMonth`.
 * e.g. getPreviousMonths('2026-04', 3) → ['2026-02','2026-03','2026-04']
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

// GET /api/insights?month=YYYY-MM
router.get('/', async (req, res) => {
  const { month } = req.query;
  if (!month || !MONTH_RE.test(month))
    return res.status(400).json({ error: 'month query param required in YYYY-MM format' });

  // ── Cache check ─────────────────────────────────────────────────────────────
  const cached = db
    .prepare('SELECT content_json, generated_at FROM insights_cache WHERE month = ?')
    .get(month);

  if (cached) {
    const ageMs = Date.now() - new Date(cached.generated_at + 'Z').getTime();
    if (ageMs < CACHE_TTL_MS) {
      try {
        return res.json(JSON.parse(cached.content_json));
      } catch {
        // corrupt cache — fall through to regenerate
      }
    }
  }

  // ── Gather 3 months of transactions ─────────────────────────────────────────
  const months = getPreviousMonths(month, 3);
  const monthlyData = months.map((mo) => ({
    month: mo,
    transactions: db
      .prepare(
        `SELECT date, type, category, amount, description
         FROM transactions
         WHERE date LIKE ?
         ORDER BY date ASC`
      )
      .all(`${mo}-%`),
  }));

  // Check we have at least something to analyse
  const totalTx = monthlyData.reduce((sum, m) => sum + m.transactions.length, 0);
  if (totalTx === 0) {
    return res.json({ observations: [] });
  }

  // ── LLM call with one retry on any failure ───────────────────────────────────
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      result = await generateInsights(monthlyData);
      break;
    } catch (err) {
      console.error(`[GET /insights] attempt ${attempt} failed:`, err.message);
      if (attempt === 2) {
        // Never throw 500 — return empty observations
        return res.json({ observations: [] });
      }
    }
  }

  // ── Cache successful result ──────────────────────────────────────────────────
  const contentJson = JSON.stringify(result);
  db.prepare(
    `INSERT INTO insights_cache (month, content_json, generated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(month) DO UPDATE
       SET content_json = excluded.content_json,
           generated_at = excluded.generated_at`
  ).run(month, contentJson);

  res.json(result);
});

export default router;
