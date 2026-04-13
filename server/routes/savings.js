import { Router } from 'express';
import db from '../db/database.js';
import { checkSavingsInvariant } from '../helpers/checkSavingsInvariant.js';

const router = Router();

// ── GET /api/savings ──────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const { total_balance } = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total_balance FROM transactions WHERE type = 'savings'`)
    .get();

  const { total_allocated } = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total_allocated FROM allocations`)
    .get();

  const unallocated = total_balance - total_allocated;

  const activeGoals = db
    .prepare(`SELECT id, name, target_amount FROM goals WHERE status = 'active' ORDER BY created_at DESC`)
    .all();

  const per_goal = activeGoals.map((g) => {
    const { allocated } = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS allocated FROM allocations WHERE goal_id = ?`)
      .get(g.id);
    const progress_pct =
      g.target_amount > 0 ? Math.min(100, Math.round((allocated / g.target_amount) * 100)) : 0;
    return { goal_id: g.id, goal_name: g.name, allocated, target: g.target_amount, progress_pct };
  });

  res.json({ total_balance, total_allocated, unallocated, per_goal });
});

// ── POST /api/savings/allocate ────────────────────────────────────────────────
router.post('/allocate', (req, res) => {
  const { goal_id, amount } = req.body;

  if (typeof amount !== 'number' || amount <= 0)
    return res.status(400).json({ error: 'amount must be a positive number' });

  const goal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(goal_id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  if (goal.status !== 'active') return res.status(400).json({ error: 'Goal is not active' });

  const { valid } = checkSavingsInvariant(amount);
  if (!valid)
    return res.status(400).json({ error: 'Cannot allocate more than unallocated pool' });

  db.prepare(`INSERT INTO allocations (goal_id, amount) VALUES (?, ?)`).run(goal_id, amount);
  res.status(201).json({ ok: true });
});

// ── POST /api/savings/reallocate ──────────────────────────────────────────────
router.post('/reallocate', (req, res) => {
  const { from_goal_id, to_goal_id, amount } = req.body;

  if (typeof amount !== 'number' || amount <= 0)
    return res.status(400).json({ error: 'amount must be a positive number' });

  const fromGoal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(from_goal_id);
  if (!fromGoal) return res.status(404).json({ error: 'from_goal not found' });

  const toGoal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(to_goal_id);
  if (!toGoal) return res.status(404).json({ error: 'to_goal not found' });

  const { allocated: fromAllocated } = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS allocated FROM allocations WHERE goal_id = ?`)
    .get(from_goal_id);

  if (fromAllocated < amount)
    return res.status(400).json({ error: 'from_goal has insufficient allocated balance' });

  db.transaction(() => {
    db.prepare(`INSERT INTO allocations (goal_id, amount) VALUES (?, ?)`).run(from_goal_id, -amount);
    db.prepare(`INSERT INTO allocations (goal_id, amount) VALUES (?, ?)`).run(to_goal_id, amount);
  })();

  res.status(201).json({ ok: true });
});

export default router;
