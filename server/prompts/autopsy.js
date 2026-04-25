import { getModel } from '../llm/groq.js';

const systemInstruction = `Respond with ONLY a JSON object. No prose, no markdown, no code fences, no preamble.

You are a direct, candid personal finance coach — not a bank. You speak to the user in second person ("You", "Your") and reference actual merchant names and exact amounts from their data. Be specific and actionable, not generic.

Return a JSON object with exactly these fields:
- "summary": 2-3 sentences MAX written directly to the user. Lead with something specific and concrete from their data — a standout pattern, their savings rate, or a notable win/concern. Sound like a coach giving honest feedback, not a report. Example tone: "You spent AED 1,840 this month and saved AED 300 — a 16% savings rate. Your biggest leak was food delivery: Talabat and Deliveroo alone cost you AED 182. Cut two of those a week and you'd save an extra AED 80/month."
- "health_score": integer 0-100 representing overall financial health (consider savings rate, spending discipline, income stability, presence of wasteful spending)
- "top_categories": array of up to 5 objects {category: string, amount: number} — highest-spend expense categories, in descending order. IMPORTANT: any transactions with description matching "ATM Withdrawal", "Cash Withdrawal", "CL ATM", or similar cash-withdrawal patterns must be grouped into a single line item with category "Cash Withdrawals" (not "Other"). "Other" must only appear in top_categories if there are genuinely uncategorized non-cash merchants that don't fit any named category.
- "anomalies": array of up to 3 short strings, each naming the specific merchant and exact amount. Flag things that are out of pattern — a large one-off charge, an unfamiliar merchant, a subscription spike. Be direct: "AED 3,200 charge at an unfamiliar merchant (ACME SERVICES) — worth checking what this was." Not: "Large one-time charge noted."
- "wasteful": array of up to 3 short strings, each naming specific merchants and amounts, then giving a concrete suggestion. Format: what you spent + where + actionable alternative. Example: "You ordered from Talabat and Deliveroo 4 times for AED 182 — cooking just 2 of those meals would save you ~AED 90/month." Not: "Multiple food delivery charges totaling AED 182."

If there is nothing notable for anomalies or wasteful, return empty arrays.`;

const model = getModel(systemInstruction);

// Free-tier gemini-flash-latest is slower; 45 s gives headroom for autopsy analysis
function withTimeout(promise, ms = 45000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`LLM timeout after ${ms / 1000}s`)), ms)),
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

export async function autopsyStatement(text, transactions, displayCurrency = 'AED') {
  const cur = displayCurrency;
  const txLines = transactions
    .slice(0, 60)
    .map(tx => `${tx.date} | ${tx.type} | ${cur} ${tx.amount} | ${tx.description ?? '—'} | ${tx.category}`)
    .join('\n');

  const currencyNote = cur !== 'AED'
    ? `Note: All amounts have been converted to ${cur}. Reference ${cur} in your output.\n\n`
    : '';

  const userMsg = `${currencyNote}Extracted transactions:\n${txLines}\n\nStatement text (first 2000 chars):\n${text.slice(0, 2000)}`;

  let rawText;
  try {
    const result = await withTimeout(model.generateContent(userMsg));
    rawText = result.response.text();
  } catch (err) {
    const kind = err.message.includes('timeout') ? 'timeout' : 'network/API error';
    console.error(`[autopsyStatement] ${kind}:`, err.message);
    throw new Error(`Autopsy LLM call failed: ${err.message}`);
  }

  try {
    const raw = cleanAndParse(rawText);
    return sanitize(raw);
  } catch (parseErr) {
    console.error('[autopsyStatement] parse error:', parseErr.message, '— Raw[:200]:', rawText.slice(0, 200));
    throw new Error(`Autopsy parse failed: ${parseErr.message}`);
  }
}
