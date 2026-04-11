import { getModel } from '../llm/gemini.js';
import { VALID_CATEGORIES } from '../routes/transactions.js';

// Income is valid for income-type; exclude Savings (never from statement)
const ALL_STATEMENT_CATEGORIES = VALID_CATEGORIES.filter(c => c !== 'Savings');

const systemInstruction = `You are a financial data extractor. Extract all transactions from bank statement text and return structured JSON.

Return a JSON object with a single key "transactions" — an array where each item has:
- "type": "income" or "expense" only (never "savings")
- "amount": positive number, no currency symbols
- "date": YYYY-MM-DD
- "description": brief plain-English description
- "category": one of: ${ALL_STATEMENT_CATEGORIES.join(', ')}

Rules:
- Credits, deposits, salary payments, refunds → type "income", category "Income"
- All other outflows → type "expense"
- Skip balance rows, opening/closing balance lines, and summary totals
- If year is missing from a date, infer from context clues in the statement
- Return ONLY the JSON object — no markdown, no explanation`;

const model = getModel(systemInstruction);

function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout after 15s')), ms)),
  ]);
}

function cleanAndParse(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.transactions)) throw new Error('Missing transactions array');
  return parsed.transactions;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateAndNormalize(transactions) {
  return transactions
    .filter(tx => {
      if (!['income', 'expense'].includes(tx.type)) return false;
      if (typeof tx.amount !== 'number' || tx.amount <= 0) return false;
      if (!DATE_RE.test(tx.date)) return false;
      return true;
    })
    .map(tx => ({
      type:        tx.type,
      amount:      tx.amount,
      date:        tx.date,
      description: typeof tx.description === 'string' ? tx.description : null,
      category:    VALID_CATEGORIES.includes(tx.category)
        ? tx.category
        : tx.type === 'income' ? 'Income' : 'Other',
    }));
}

export async function parseStatement(text) {
  const truncated = text.slice(0, 8000);
  const userMsg = `Bank statement text:\n\n${truncated}`;

  let rawText;
  try {
    const result = await withTimeout(model.generateContent(userMsg));
    rawText = result.response.text();
  } catch (err) {
    throw new Error(`LLM call failed: ${err.message}`);
  }

  try {
    const rows = cleanAndParse(rawText);
    const valid = validateAndNormalize(rows);
    if (valid.length === 0) throw new Error('No valid transactions found');
    return valid;
  } catch {
    // One retry with an explicit format reminder
    const retryMsg = `${userMsg}\n\nIMPORTANT: Respond with ONLY a JSON object. Example: {"transactions":[{"type":"expense","amount":50.00,"date":"2024-01-15","description":"Coffee","category":"Food"}]}`;
    let retryText;
    try {
      const retryResult = await withTimeout(model.generateContent(retryMsg));
      retryText = retryResult.response.text();
    } catch (err) {
      throw new Error(`Retry LLM call failed: ${err.message}`);
    }
    const rows = cleanAndParse(retryText);
    const valid = validateAndNormalize(rows);
    if (valid.length === 0) throw new Error('No valid transactions after retry');
    return valid;
  }
}
