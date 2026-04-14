import { getModel } from '../llm/gemini.js';

const systemInstruction = `Respond with ONLY a JSON object. No prose, no markdown, no code fences, no preamble.

You are a personal finance analyst. Analyze transaction data across multiple months and return 3-5 concise, actionable insights.

Return a JSON object with exactly this field:
- "observations": array of 3-5 objects, each with:
  - "title": string — short label (5-8 words max)
  - "detail": string — 1-2 sentences with specific amounts, category names, or transaction counts; compare to prior months when data is available
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

Sentiment examples:
  - "Salary increased 10%" → trend: up, sentiment: positive (more income is good)
  - "Dining expenses dropped 30%" → trend: down, sentiment: positive (less spending is good)
  - "Transport costs rose 25%" → trend: up, sentiment: negative (more spending is bad)
  - "Savings rate fell from 20% to 12%" → trend: down, sentiment: negative (saving less is bad)
  - "You made 47 transactions this month" → trend: flat, sentiment: neutral (pure fact)

Rules:
- Every observation must reference specific numbers from the data (e.g. "AED 1,200", "3 transactions", "up 18%")
- Compare current month to prior months whenever at least 2 months of data are present
- Cover varied aspects: total spending, top categories, savings behavior, income patterns, unusual spikes
- Do not invent numbers; only use figures present in the provided data
- If there is insufficient data for comparisons, still extract observations about the current month alone
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
 * @returns {Promise<{observations: Array<{title, detail, trend}>}>}
 */
export async function generateInsights(monthlyData) {
  const lines = monthlyData
    .map(({ month, transactions }) => {
      const txLines = transactions
        .slice(0, 40)
        .map(
          (tx) =>
            `${tx.date} | ${tx.type} | AED ${tx.amount} | ${tx.category} | ${tx.description ?? '—'}`
        )
        .join('\n');
      return `=== ${month} (${transactions.length} transactions) ===\n${txLines || '(no transactions)'}`;
    })
    .join('\n\n');

  const userMsg = `Monthly transaction data (oldest to newest):\n\n${lines}`;

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
