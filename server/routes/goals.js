import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';
import { generatePlan } from '../prompts/plan.js';
import { getRate } from '../lib/exchangeRates.js';

const router = Router();

const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_STATUSES   = ['active', 'completed', 'archived'];
const DATE_RE          = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Attach computed fields to a raw goal row. */
function enrich(goal) {
  const { allocated } = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS allocated FROM allocations WHERE goal_id = ?`)
    .get(goal.id);

  const progress_pct =
    goal.target_amount > 0
      ? Math.min(100, Math.round((allocated / goal.target_amount) * 100))
      : 0;

  const deadlineMs = new Date(goal.deadline + 'T00:00:00').getTime();
  const todayMs    = new Date(today()      + 'T00:00:00').getTime();
  const days_remaining = Math.round((deadlineMs - todayMs) / 86_400_000);

  return { ...goal, allocated, progress_pct, days_remaining };
}

// GET /api/goals
router.get('/', (_req, res) => {
  const goals = db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all();
  res.json(goals.map(enrich));
});

// POST /api/goals
router.post('/', (req, res) => {
  const { name, target_amount, deadline, priority } = req.body;

  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim())
    errors.push('name is required');
  if (typeof target_amount !== 'number' || target_amount <= 0)
    errors.push('target_amount must be a positive number');
  if (!deadline || !DATE_RE.test(deadline))
    errors.push('deadline must be YYYY-MM-DD');
  else if (deadline <= today())
    errors.push('deadline must be in the future');
  if (!priority || !VALID_PRIORITIES.includes(priority))
    errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);

  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const result = db
    .prepare(`INSERT INTO goals (name, target_amount, deadline, priority) VALUES (?, ?, ?, ?)`)
    .run(name.trim(), target_amount, deadline, priority);

  const created = db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(enrich(created));
});

// ── Plan helpers ──────────────────────────────────────────────────────────────

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

function computePlanCacheKey() {
  const goals       = db.prepare(`SELECT id, name, target_amount, deadline, priority, status FROM goals ORDER BY id`).all();
  const allocations = db.prepare(`SELECT goal_id, amount FROM allocations ORDER BY id`).all();
  const lastTx      = db.prepare(`SELECT MAX(date) AS d FROM transactions`).get();
  const input       = JSON.stringify({ goals, allocations, lastTx: lastTx?.d ?? null });
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

// POST /api/goals/plan
router.post('/plan', async (_req, res) => {
  // ── Cache check ────────────────────────────────────────────────────────────
  const cacheKey = computePlanCacheKey();
  const cached   = db.prepare('SELECT content_json FROM plans_cache WHERE cache_key = ?').get(cacheKey);
  if (cached) {
    try { return res.json(JSON.parse(cached.content_json)); } catch { /* corrupt — fall through */ }
  }

  // ── Gather goals ───────────────────────────────────────────────────────────
  const activeGoals = db.prepare(`SELECT * FROM goals WHERE status = 'active' ORDER BY
    CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id`).all();

  if (activeGoals.length === 0) {
    return res.json({ overall_feasible: null, error: 'No active goals to plan for.' });
  }

  const enrichedGoals = activeGoals.map(g => {
    const { allocated } = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS allocated FROM allocations WHERE goal_id = ?`)
      .get(g.id);
    const deadlineMs    = new Date(g.deadline + 'T00:00:00').getTime();
    const todayMs       = new Date(today()    + 'T00:00:00').getTime();
    const days_remaining = Math.round((deadlineMs - todayMs) / 86_400_000);
    return { ...g, allocated, days_remaining };
  });

  // ── Gather savings state ───────────────────────────────────────────────────
  const { unallocated_pool } = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='savings') -
      (SELECT COALESCE(SUM(amount),0) FROM allocations) AS unallocated_pool
  `).get();

  // ── Gather 3 months of history ────────────────────────────────────────────
  const currentMonth   = new Date().toISOString().slice(0, 7);
  const months         = getPreviousMonths(currentMonth, 3);
  const monthlyHistory = months.map(mo => {
    const p = `${mo}-%`;
    const { income }   = db.prepare(`SELECT COALESCE(SUM(amount),0) AS income   FROM transactions WHERE type='income'  AND date LIKE ?`).get(p);
    const { expenses } = db.prepare(`SELECT COALESCE(SUM(amount),0) AS expenses FROM transactions WHERE type='expense' AND date LIKE ?`).get(p);
    const by_category  = db.prepare(`
      SELECT category, COALESCE(SUM(amount),0) AS total
      FROM transactions WHERE type='expense' AND date LIKE ?
      GROUP BY category ORDER BY total DESC
    `).all(p);
    return { month: mo, income, expenses, by_category };
  });

  // Top expense transactions across the history window — used by LLM to cite merchants
  const recentExpenses = months.flatMap(mo => {
    const p = `${mo}-%`;
    return db.prepare(`
      SELECT date, description, category, amount
      FROM transactions WHERE type='expense' AND date LIKE ?
      ORDER BY amount DESC LIMIT 30
    `).all(p).map(tx => ({ ...tx, month: mo }));
  });

  const monthsWithData       = monthlyHistory.filter(m => m.income > 0 || m.expenses > 0);
  const insufficient_history = monthsWithData.length < 3;
  const totalNet             = monthlyHistory.reduce((s, m) => s + (m.income - m.expenses), 0);
  const monthly_net_average  = monthsWithData.length > 0
    ? totalNet / monthsWithData.length
    : 0;

  // ── Convert amounts to display_currency ───────────────────────────────────
  const { display_currency } = db.prepare('SELECT display_currency FROM user_settings WHERE id=1').get() ?? { display_currency: 'AED' };
  const dispRate = await getRate('AED', display_currency);
  const scale    = (n) => n * dispRate;

  const enrichedGoalsDisp = enrichedGoals.map(g => ({
    ...g,
    target_amount: scale(g.target_amount),
    allocated:     scale(g.allocated),
  }));

  const monthlyHistoryDisp = monthlyHistory.map(m => ({
    ...m,
    income:       scale(m.income),
    expenses:     scale(m.expenses),
    by_category:  m.by_category.map(c => ({ ...c, total: scale(c.total) })),
  }));

  const recentExpensesDisp = recentExpenses.map(tx => ({
    ...tx,
    amount: scale(tx.amount),
  }));

  // ── LLM call with one retry on parse failure ───────────────────────────────
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      result = await generatePlan({
        goals: enrichedGoalsDisp,
        monthlyHistory: monthlyHistoryDisp,
        recentExpenses: recentExpensesDisp,
        monthly_net_average: scale(monthly_net_average),
        unallocated_pool: scale(unallocated_pool),
        insufficient_history,
        displayCurrency: display_currency,
      });
      break;
    } catch (err) {
      console.error(`[POST /goals/plan] attempt ${attempt} failed:`, err.message);
      if (attempt === 2) {
        return res.json({ overall_feasible: null, error: err.message });
      }
    }
  }

  // ── Store in cache ─────────────────────────────────────────────────────────
  const contentJson = JSON.stringify(result);
  // Only one cached plan per key; replace any stale key for this state
  db.prepare(`
    INSERT INTO plans_cache (cache_key, content_json, generated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(cache_key) DO UPDATE SET content_json=excluded.content_json, generated_at=excluded.generated_at
  `).run(cacheKey, contentJson);

  res.json(result);
});

// PUT /api/goals/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Goal not found' });

  const name          = req.body.name          !== undefined ? req.body.name          : existing.name;
  const target_amount = req.body.target_amount !== undefined ? req.body.target_amount : existing.target_amount;
  const deadline      = req.body.deadline      !== undefined ? req.body.deadline      : existing.deadline;
  const priority      = req.body.priority      !== undefined ? req.body.priority      : existing.priority;
  const status        = req.body.status        !== undefined ? req.body.status        : existing.status;

  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim())
    errors.push('name is required');
  if (typeof target_amount !== 'number' || target_amount <= 0)
    errors.push('target_amount must be a positive number');
  if (!DATE_RE.test(deadline))
    errors.push('deadline must be YYYY-MM-DD');
  if (!VALID_PRIORITIES.includes(priority))
    errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  if (!VALID_STATUSES.includes(status))
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);

  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  db.prepare(
    `UPDATE goals SET name=?, target_amount=?, deadline=?, priority=?, status=? WHERE id=?`
  ).run(name.trim(), target_amount, deadline, priority, status, existing.id);

  const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(existing.id);
  res.json(enrich(updated));
});

// DELETE /api/goals/:id  (allocations cascade via FK)
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Goal not found' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(existing.id);
  res.status(204).send();
});

export default router;
