import { getModel } from '../llm/gemini.js';

const VALID_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Rent', 'Bills', 'Subscriptions',
  'Entertainment', 'Shopping', 'Health', 'Education', 'Travel',
  'Income', 'Savings', 'Other',
];

const SYSTEM_INSTRUCTION =
  `You are a financial transaction categorizer. ` +
  `Given a transaction description, amount, and type, choose the single best category. ` +
  `Available categories: ${VALID_CATEGORIES.join(', ')}. ` +
  `Return ONLY valid JSON in this exact format: {"category": "CategoryName"}. ` +
  `Never use a category outside the list. If uncertain, use "Other".`;

const model = getModel(SYSTEM_INSTRUCTION);

function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function parseCategory(text) {
  const parsed = JSON.parse(text.trim());
  const cat = parsed?.category;
  return VALID_CATEGORIES.includes(cat) ? cat : 'Other';
}

/**
 * Calls Gemini to categorize a transaction.
 * Returns one of the 14 fixed categories. Defaults to "Other" on any failure.
 *
 * @param {{ description: string, amount: number, type: string }} tx
 * @returns {Promise<string>} category name
 */
export async function categorizeTransaction({ description, amount, type }) {
  const userMsg =
    `Description: "${description || 'No description'}" | Amount: ${amount} | Type: ${type}`;

  try {
    // First attempt
    const result = await withTimeout(model.generateContent(userMsg));
    const text = result.response.text();

    try {
      return parseCategory(text);
    } catch {
      // One retry with a corrective nudge
      try {
        const retry = await withTimeout(
          model.generateContent(
            `${userMsg}\n\nIMPORTANT: Respond with ONLY this JSON and nothing else: {"category": "CategoryName"}`
          )
        );
        return parseCategory(retry.response.text());
      } catch (retryErr) {
        console.error('[categorize] retry parse failed:', retryErr.message);
        return 'Other';
      }
    }
  } catch (err) {
    console.error('[categorize] LLM error:', err.message);
    return 'Other';
  }
}
