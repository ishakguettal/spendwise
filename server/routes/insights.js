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

function round2(n) { return Math.round(n * 100) / 100; }

/** Compute totals for each month. */
function computeMonthlySummary(monthlyData) {
  return monthlyData.map(({ month, transactions }) => {
    const income   = round2(transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    const expenses = round2(transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    const savings  = round2(transactions.filter(t => t.category === 'Savings').reduce((s, t) => s + t.amount, 0));
    const net_cash_flow = round2(income - expenses);

    const by_category = {};
    for (const tx of transactions) {
      if (tx.type === 'expense') {
        by_category[tx.category] = round2((by_category[tx.category] || 0) + tx.amount);
      }
    }

    return { month, income, expenses, savings, net_cash_flow, by_category };
  });
}

/** Format a percentage delta between two values as a signed string. */
function pctDelta(cur, prv) {
  if (prv === 0 && cur === 0) return null;
  if (prv === 0) return 'new this month';
  if (cur === 0) return 'dropped to zero';
  const pct = ((cur - prv) / Math.abs(prv)) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

/** Annotate each month with deltas vs the prior month. */
function computeDeltas(summaries) {
  return summaries.map((s, i) => {
    if (i === 0) return { ...s, deltas: null };
    const prev = summaries[i - 1];

    const category_deltas = {};
    const allCats = new Set([...Object.keys(s.by_category), ...Object.keys(prev.by_category)]);
    for (const cat of allCats) {
      const d = pctDelta(s.by_category[cat] || 0, prev.by_category[cat] || 0);
      if (d !== null) category_deltas[cat] = d;
    }

    return {
      ...s,
      deltas: {
        income:        pctDelta(s.income,        prev.income),
        expenses:      pctDelta(s.expenses,      prev.expenses),
        savings:       pctDelta(s.savings,       prev.savings),
        net_cash_flow: pctDelta(s.net_cash_flow, prev.net_cash_flow),
        by_category:   category_deltas,
      },
    };
  });
}

/** 3-month averages per category (top 5 by avg spend) + total expenses average. */
function computeBaselines(summaries) {
  const allCats = new Set(summaries.flatMap(s => Object.keys(s.by_category)));

  const avgByCategory = {};
  for (const cat of allCats) {
    const values = summaries.map(s => s.by_category[cat] || 0);
    avgByCategory[cat] = round2(values.reduce((a, b) => a + b, 0) / values.length);
  }

  const top_categories = Object.entries(avgByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, avg_monthly]) => ({ category, avg_monthly }));

  const avg_monthly_total_expenses = round2(
    summaries.reduce((s, m) => s + m.expenses, 0) / summaries.length
  );

  return { top_categories, avg_monthly_total_expenses };
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

  // ── Pre-compute structured context for the LLM ──────────────────────────────
  const rawSummaries   = computeMonthlySummary(monthlyData);
  const monthly_summary = computeDeltas(rawSummaries);
  const baselines       = computeBaselines(rawSummaries);

  // ── LLM call with one retry on any failure ───────────────────────────────────
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      result = await generateInsights(monthlyData, monthly_summary, baselines);
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
