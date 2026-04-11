import { getModel } from '../llm/gemini.js';

const systemInstruction = `You are a personal finance analyst. Analyze bank statement data and return a concise financial health report.

Return a JSON object with exactly these fields:
- "summary": 2-3 sentence plain-English overview of the person's finances
- "health_score": integer 0-100 representing overall financial health (consider savings rate, spending discipline, income stability, presence of wasteful spending)
- "top_categories": array of up to 5 objects {category: string, amount: number} — highest-spend expense categories, in descending order
- "anomalies": array of up to 3 short strings describing unusual transactions or irregular patterns (e.g. "Large one-time charge of AED 3,200 at an unfamiliar merchant")
- "wasteful": array of up to 3 short strings identifying potentially wasteful spending patterns (e.g. "Multiple food delivery charges totaling AED 650 this month")

If there is nothing notable for anomalies or wasteful, return empty arrays.
Return ONLY the JSON object — no markdown, no explanation.`;

const model = getModel(systemInstruction);

function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout after 15s')), ms)),
  ]);
}

function cleanAndParse(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

function sanitize(raw) {
  return {
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    health_score: typeof raw.health_score === 'number'
      ? Math.max(0, Math.min(100, Math.round(raw.health_score)))
      : 50,
    top_categories: Array.isArray(raw.top_categories)
      ? raw.top_categories
          .slice(0, 5)
          .filter(c => typeof c.category === 'string' && typeof c.amount === 'number')
      : [],
    anomalies: Array.isArray(raw.anomalies)
      ? raw.anomalies.slice(0, 3).filter(s => typeof s === 'string')
      : [],
    wasteful: Array.isArray(raw.wasteful)
      ? raw.wasteful.slice(0, 3).filter(s => typeof s === 'string')
      : [],
  };
}

export async function autopsyStatement(text, transactions) {
  const txLines = transactions
    .slice(0, 60)
    .map(tx => `${tx.date} | ${tx.type} | AED ${tx.amount} | ${tx.description ?? '—'} | ${tx.category}`)
    .join('\n');

  const userMsg = `Extracted transactions:\n${txLines}\n\nStatement text (first 2000 chars):\n${text.slice(0, 2000)}`;

  try {
    const result = await withTimeout(model.generateContent(userMsg));
    const raw = cleanAndParse(result.response.text());
    return sanitize(raw);
  } catch (err) {
    throw new Error(`Autopsy LLM call failed: ${err.message}`);
  }
}
