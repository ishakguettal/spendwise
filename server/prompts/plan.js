import { getModel } from '../llm/gemini.js';

const systemInstruction = `Respond with ONLY a JSON object. No prose, no markdown, no code fences, no preamble.

You are a certified financial planner. Given a person's multi-month transaction history, active savings goals, and current savings pool, generate a concrete monthly contribution plan.

Return a JSON object with exactly these fields:

- "monthly_savings_target": number — total AED the person should set aside each month across all goals combined

- "per_goal_plan": array of objects, one entry per goal in the input (preserve all goal_ids), each with:
  - "goal_id": integer — matches the id from the input
  - "monthly_contribution": number — AED to contribute to this goal per month (rounded to nearest integer; can be 0 if already fully funded via allocated pool)
  - "feasibility": "easy" | "moderate" | "aggressive" | "infeasible"
      easy       = monthly_contribution < 10% of monthly_net_average
      moderate   = 10–25% of monthly_net_average
      aggressive = 25–60% of monthly_net_average (hard but possible)
      infeasible = deadline mathematically cannot be met given remaining shortfall and months left, OR this goal's share pushes total contributions above 60% of monthly_net_average
  - "suggested_new_deadline": null or "YYYY-MM-DD" — set only when feasibility is "infeasible"; compute the earliest realistic deadline given the user's capacity after higher-priority goals are funded
  - "reasoning": string — 1-2 sentences explaining the contribution amount and feasibility rating; include specific numbers

- "category_cuts": array of up to 5 objects identifying spending categories where meaningful reductions are possible:
  - "category": string
  - "current_avg": number — average monthly AED spend based on provided history
  - "target_avg": number — suggested reduced monthly amount
  - "reduction": number — AED saved per month (current_avg - target_avg)
  - "reason": string — concise explanation of why this category was chosen

- "overall_feasible": boolean — true only if ALL goals can be met on their original deadlines without exceeding 60% of monthly_net_average

- "notes": string — 1-2 sentences of high-level advice for the user

Priority rules (apply in this order):
1. Fully fund high-priority goals first, then medium, then low
2. If the unallocated_pool already covers a goal's remaining shortfall, set monthly_contribution to 0 and feasibility to "easy"
3. If sum of all monthly_contributions > monthly_net_average × 0.6: set overall_feasible=false; mark the lowest-priority goals as "infeasible" and give them suggested_new_deadlines
4. If insufficient_history=true: note reduced confidence in reasoning; do not invent spending patterns
5. All monetary values in AED, rounded to nearest integer`;

const model = getModel(systemInstruction);

function withTimeout(promise, ms = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Plan LLM timeout after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function cleanAndParse(text) {
  return JSON.parse(text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
}

const VALID_FEASIBILITY = ['easy', 'moderate', 'aggressive', 'infeasible'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(raw, goalIds) {
  // Ensure per_goal_plan covers every goal we sent
  const planMap = {};
  if (Array.isArray(raw.per_goal_plan)) {
    for (const entry of raw.per_goal_plan) {
      if (typeof entry.goal_id === 'number' && goalIds.includes(entry.goal_id)) {
        planMap[entry.goal_id] = {
          goal_id:               entry.goal_id,
          monthly_contribution:  typeof entry.monthly_contribution === 'number' ? Math.round(entry.monthly_contribution) : 0,
          feasibility:           VALID_FEASIBILITY.includes(entry.feasibility) ? entry.feasibility : 'moderate',
          suggested_new_deadline: (typeof entry.suggested_new_deadline === 'string' && DATE_RE.test(entry.suggested_new_deadline))
            ? entry.suggested_new_deadline : null,
          reasoning: typeof entry.reasoning === 'string' ? entry.reasoning.trim() : '',
        };
      }
    }
  }
  // Fill in any missing goals with a safe default
  for (const id of goalIds) {
    if (!planMap[id]) {
      planMap[id] = { goal_id: id, monthly_contribution: 0, feasibility: 'moderate', suggested_new_deadline: null, reasoning: '' };
    }
  }

  const category_cuts = Array.isArray(raw.category_cuts)
    ? raw.category_cuts.slice(0, 5).filter(c =>
        typeof c.category === 'string' &&
        typeof c.current_avg === 'number' &&
        typeof c.target_avg === 'number'
      ).map(c => ({
        category:    c.category.trim(),
        current_avg: Math.round(c.current_avg),
        target_avg:  Math.round(c.target_avg),
        reduction:   Math.round(c.current_avg - c.target_avg),
        reason:      typeof c.reason === 'string' ? c.reason.trim() : '',
      }))
    : [];

  return {
    monthly_savings_target: typeof raw.monthly_savings_target === 'number' ? Math.round(raw.monthly_savings_target) : 0,
    per_goal_plan:          Object.values(planMap),
    category_cuts,
    overall_feasible:       typeof raw.overall_feasible === 'boolean' ? raw.overall_feasible : null,
    notes:                  typeof raw.notes === 'string' ? raw.notes.trim() : '',
  };
}

/**
 * Generate a reverse savings plan.
 * @param {object} context
 * @param {Array}  context.goals          - Active goals with allocated, days_remaining
 * @param {Array}  context.monthlyHistory - [{month, income, expenses, by_category}]
 * @param {number} context.monthly_net_average
 * @param {number} context.unallocated_pool
 * @param {boolean} context.insufficient_history
 */
export async function generatePlan(context) {
  const { goals, monthlyHistory, monthly_net_average, unallocated_pool, insufficient_history } = context;

  const goalLines = goals.map(g =>
    `  • [id=${g.id}] "${g.name}" | target: AED ${g.target_amount} | allocated: AED ${g.allocated} | remaining: AED ${Math.max(0, g.target_amount - g.allocated)} | priority: ${g.priority} | days_remaining: ${g.days_remaining} | months_remaining: ${Math.max(1, Math.ceil(g.days_remaining / 30))}`
  ).join('\n');

  const historyLines = monthlyHistory.map(m => {
    const catLines = m.by_category.map(c => `      ${c.category}: AED ${Math.round(c.total)}`).join('\n');
    return `  ${m.month}: income AED ${Math.round(m.income)}, expenses AED ${Math.round(m.expenses)}, net AED ${Math.round(m.income - m.expenses)}\n    By category:\n${catLines}`;
  }).join('\n');

  const userMsg = [
    `FINANCIAL CONTEXT`,
    `insufficient_history: ${insufficient_history}`,
    `monthly_net_average (income − expenses): AED ${Math.round(monthly_net_average)}`,
    `unallocated_pool (saved but not yet assigned): AED ${Math.round(unallocated_pool)}`,
    ``,
    `ACTIVE GOALS (${goals.length}):`,
    goalLines,
    ``,
    `TRANSACTION HISTORY (${monthlyHistory.length} months, oldest first):`,
    historyLines,
  ].join('\n');

  let rawText;
  try {
    const result = await withTimeout(model.generateContent(userMsg));
    rawText = result.response.text();
  } catch (err) {
    const kind = err.message.includes('timeout') ? 'timeout' : 'network/API error';
    console.error(`[generatePlan] ${kind}:`, err.message);
    throw new Error(`Plan LLM call failed: ${err.message}`);
  }

  // May throw — caller handles retry
  const raw = cleanAndParse(rawText);
  return sanitize(raw, goals.map(g => g.id));
}
