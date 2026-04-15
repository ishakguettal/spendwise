/**
 * Privacy layer for bank statement text.
 *
 * Purpose: ensure that bank-identifying metadata — account numbers, IBANs,
 * bank reference codes, contact details — never leaves the user's session.
 * Only normalized transaction data (dates, amounts, merchant descriptions)
 * is forwarded to Gemini or stored in the database.
 *
 * Call sanitizeStatementText(rawText) immediately after PDF extraction (or
 * receipt of pasted text) and before any LLM or DB interaction.
 */

// ── Line-level removal ────────────────────────────────────────────────────────
// Any line that matches one of these patterns is dropped entirely.

const SENSITIVE_LINE_KEYWORDS = [
  'account holder',
  'account name',
  'customer name',
  'iban',
  'swift',
  'sort code',
  'account number',
  'account no',
  'statement period',
  'address',
  'email',
  'mobile',
  'phone',
  'tel:',
];

// "Page X of Y" — page numbers
const PAGE_NUMBER_RE = /^\s*page\s+\d+\s+of\s+\d+\s*$/i;

// Lines that are just an all-caps bank name: 2+ words, all caps, may end in PJSC / BANK / LLC etc.
const BANK_NAME_LINE_RE = /^\s*[A-Z][A-Z\s&.'-]{4,}(BANK|PJSC|LLC|CORP|N\.A\.|FSB|BSC|PLC)\.?\s*$/;

function isSensitiveLine(line) {
  const lower = line.toLowerCase();
  if (SENSITIVE_LINE_KEYWORDS.some(kw => lower.includes(kw))) return true;
  if (PAGE_NUMBER_RE.test(line)) return true;
  if (BANK_NAME_LINE_RE.test(line)) return true;
  return false;
}

// ── Inline redaction patterns ─────────────────────────────────────────────────
// Applied to lines that survive the line-removal pass.

const REDACT_PATTERNS = [
  // IBAN: 2 uppercase letters + 2 digits + 1-30 alphanumeric chars (min total 8 chars)
  { name: 'ibans',           re: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g },

  // Card 4-4-4-4 (with optional spaces or hyphens)
  { name: 'cards',           re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },

  // Masked account numbers like XXXXX1506, ****1234, XX-1234
  { name: 'masked_accounts', re: /\b[X*]{4,}[\s-]?\d{2,6}\b/gi },

  // Long digit sequences (8+ digits) — likely account/card/reference numbers.
  // Exclude amounts: only match if not preceded/followed by decimal context.
  { name: 'account_numbers', re: /(?<![.,])\b\d{8,}\b(?![.,]\d)/g },

  // Bank reference codes: alphanumeric tokens 8+ chars with at least 2 digits
  // and at least 2 uppercase letters, not purely alpha (avoid merchant names).
  // e.g. FT26063BTF5D, ROC/03202606, TXN20240315ABC
  { name: 'references',      re: /\b(?=[A-Z0-9/]{8,})(?=[^/]*[A-Z]{2,})(?=[^/]*\d{2,})[A-Z0-9/]{8,}\b/g },

  // Email addresses
  { name: 'emails',          re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },

  // International phone numbers starting with +
  { name: 'phones',          re: /\+\d{8,15}/g },
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Sanitize raw bank statement text before sending to the LLM or storing.
 *
 * @param {string} rawText
 * @returns {{
 *   cleaned_text: string,
 *   removed_lines_count: number,
 *   redactions_applied: Record<string, number>
 * }}
 */
export function sanitizeStatementText(rawText) {
  const lines = rawText.split('\n');
  const kept = [];
  let removed_lines_count = 0;

  for (const line of lines) {
    if (isSensitiveLine(line)) {
      removed_lines_count++;
    } else {
      kept.push(line);
    }
  }

  // Initialise counts
  const redactions_applied = Object.fromEntries(
    REDACT_PATTERNS.map(p => [p.name, 0])
  );

  // Apply inline redactions
  const redacted = kept.map(line => {
    let out = line;
    for (const { name, re } of REDACT_PATTERNS) {
      const before = out;
      out = out.replace(re, '[REDACTED]');
      if (out !== before) {
        // Count how many replacements were made
        const original_matches = before.match(new RegExp(re.source, re.flags));
        redactions_applied[name] += original_matches ? original_matches.length : 1;
      }
    }
    return out;
  });

  return {
    cleaned_text: redacted.join('\n'),
    removed_lines_count,
    redactions_applied,
  };
}
