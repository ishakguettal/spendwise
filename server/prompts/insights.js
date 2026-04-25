import { getModel } from '../llm/groq.js';

const systemInstruction = `Respond with ONLY a JSON object. No prose, no markdown, no code fences, no preamble.

You are a personal finance analyst. You receive three inputs:
1. monthly_summary — pre-computed totals and month-over-month percentage deltas for up to 3 months
2. baselines — the user's 3-month average spending per top category and total expenses
3. raw_transactions — detailed transaction list for additional pattern discovery

Return a JSON object with exactly this field:
- "observations": array of 3-5 objects, each with:
  - "title": string — short label (5-8 words max)
  - "detail": string — 1-2 sentences with specific amounts, category names, or percentages; cite delta values and baseline comparisons where relevant
  - "trend": "up" | "down" | "flat" — raw direction of the metric (use "up" when a value increased, "down" when it decreased, "flat" when stable)
  - "sentiment": "positive" | "negative" | "neutral" — whether this observation is GOOD or BAD for the user's financial health

Sentiment rules — apply these exactly:
  - Income increased → sentiment: positive
  - Income decreased → sentiment: negative
  - Expenses increased → sentiment: negative
  - Expenses decreased → sentiment: positive
  - Net cash flow improved (higher net) → sentiment: positive
  - Net cash flow worsened (lower net) → sentiment: negative
  - Savings rate increased → sentiment: positive
  - Savings rate decreased → sentiment: negative
  - Pure observation with no clear good/bad direction → sentiment: neutral

Rules for using monthly_summary (primary source for trend observations):
  - Use the pre-computed deltas as the primary basis — do not re-derive percentages from raw transactions
  - Cite specific delta percentages in observations ("Subscriptions up 27% vs March", "Transport down 12% from last month")
  - When 3 consecutive months show a consistent direction in a category, call out the streak ("Food spending up 3 months in a row")
  - "new this month" means the category had zero spend the prior month — note this as a new expense appearing

Rules for using baselines (personalized historical averages):
  - Compare the current month's per-category spend to the user's avg_monthly baseline
  - Only surface the comparison when the deviation is 10% or more — smaller deviations are not noteworthy
  - Frame it personally: "You spent 23% more on Food than your 3-month average of AED X"
  - If current month is within 10% of baseline, describe spending as "in line with your typical pattern"
  - Also compare total expenses to avg_monthly_total_expenses when useful

Rules for using raw_transactions (supplementary detail — REQUIRED, not optional):
  - Every observation about a spending category MUST name the 1-2 largest individual merchants driving it, with their amounts — e.g. "adding ChatGPT Plus at AED 79.99 drove the subscriptions increase" or "the AED 1,200 charge at Rixos and AED 890 at Hilton account for most of the Hotels spike"
  - For a new category appearing this month, name the merchant that triggered it
  - For a category spike or sustained increase, name who you spent the most with
  - Do not re-compute totals from raw — always use the pre-computed values in monthly_summary for figures; use raw only to identify merchants

General rules:
  - Every observation must reference specific numbers (e.g. "AED 1,200", "up 18%", "3 months in a row")
  - Cover varied aspects: total spending, top categories, savings behavior, income patterns, unusual spikes
  - Do not invent numbers; only use figures present in the provided data
  - Return at least 1 observation even for sparse data`;

const model = getModel(systemInstruction);

function withTimeout(promise, ms = 45000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function cleanAndParse(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

const VALID_TRENDS     = ['up', 'down', 'flat'];
const VALID_SENTIMENTS = ['positive', 'negative', 'neutral'];

function sanitize(raw) {
  if (!raw || !Array.isArray(raw.observations)) return { observations: [] };
  return {
    observations: raw.observations
      .slice(0, 5)
      .filter(
        (o) =>
          typeof o.title === 'string' &&
          o.title.trim().length > 0 &&
          typeof o.detail === 'string' &&
          o.detail.trim().length > 0 &&
          VALID_TRENDS.includes(o.trend)
      )
      .map((o) => ({
        title:     o.title.trim(),
        detail:    o.detail.trim(),
        trend:     o.trend,
        sentiment: VALID_SENTIMENTS.includes(o.sentiment) ? o.sentiment : 'neutral',
      })),
  };
}

/**
 * Generate monthly insights from multi-month transaction data.
 * @param {Array<{month: string, transactions: Array}>} monthlyData - oldest first
 * @param {Array} monthly_summary - pre-computed totals + deltas per month
 * @param {object} baselines - 3-month category averages
 * @returns {Promise<{observations: Array<{title, detail, trend, sentiment}>}>}
 */
export async function generateInsights(monthlyData, monthly_summary, baselines, displayCurrency = 'AED') {
  const cur = displayCurrency;
  const rawLines = monthlyData
    .map(({ month, transactions }) => {
      const txLines = transactions
        .slice(0, 40)
        .map(
          (tx) =>
            `${tx.date} | ${tx.type} | ${cur} ${tx.amount} | ${tx.category} | ${tx.description ?? '—'}`
        )
        .join('\n');
      return `=== ${month} (${transactions.length} transactions) ===\n${txLines || '(no transactions)'}`;
    })
    .join('\n\n');

  const currencyNote = cur !== 'AED'
    ? `All amounts in this data have been converted to ${cur}. Reference ${cur} in all observations.\n\n`
    : '';

  const userMsg = [
    currencyNote + '## monthly_summary (totals + month-over-month deltas)',
    JSON.stringify(monthly_summary, null, 2),
    '',
    '## baselines (3-month averages)',
    JSON.stringify(baselines, null, 2),
    '',
    '## raw_transactions (oldest to newest)',
    rawLines,
  ].join('\n');

  let rawText;
  try {
    const result = await withTimeout(model.generateContent(userMsg));
    rawText = result.response.text();
  } catch (err) {
    const kind = err.message.includes('timeout') ? 'timeout' : 'network/API error';
    console.error(`[generateInsights] ${kind}:`, err.message);
    throw new Error(`Insights LLM call failed: ${err.message}`);
  }

  // May throw — caller handles retry
  const raw = cleanAndParse(rawText);
  return sanitize(raw);
}
