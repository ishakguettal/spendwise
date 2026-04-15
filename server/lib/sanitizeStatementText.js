/**
 * Privacy layer for bank statement text.
 *
 * Purpose: ensure that bank-identifying metadata — account numbers, IBANs,
 * bank reference codes, contact details — never leaves the user's session.
 * Only normalized transaction data (dates, amounts, merchant descriptions)
 * is forwarded to Gemini or stored in the database.
 *
 * Design principle: prefer to leave something through than to redact a real
 * merchant name. All patterns are narrow and explicit. Generic uppercase tokens
 * (e.g. LULU, CARREFOUR, GYMNATION) must never be matched.
 *
 * Call sanitizeStatementText(rawText) immediately after PDF extraction (or
 * receipt of pasted text) and before any LLM or DB interaction.
 */

// ── Line-level removal ────────────────────────────────────────────────────────
// A line is dropped if it starts with one of these labels (case-insensitive,
// colon optional) — we match at the start so a transaction description that
// happens to contain e.g. "address" further along is NOT removed.

const SENSITIVE_LINE_PREFIXES = [
  'account holder',
  'account name',
  'account number',
  'account no',
  'customer name',
  'iban',
  'swift',
  'sort code',
  'statement period',
  'address',
  'email',
  'mobile',
  'phone',
  'tel',
];

// Compiled once: matches "Label:" or "Label " at start of (trimmed) line
const SENSITIVE_PREFIX_RE = new RegExp(
  '^(' + SENSITIVE_LINE_PREFIXES.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\s*:?\\s',
  'i'
);

// "Page X of Y" or "X / Y" as an entire line (page counters)
const PAGE_NUMBER_RE = /^\s*(?:page\s+)?\d+\s*[/of]+\s*\d+\s*$/i;

// Lines that are just the column headers of a transaction table
// e.g. "Date  Description  Debit  Credit  Balance"
const TABLE_HEADER_RE = /^\s*(?:(?:date|description|debit|credit|balance|amount|narration|particulars|withdrawals?|deposits?)\s+){2,}$/i;

// Lines that are just an all-caps bank name ending in a legal suffix
const BANK_NAME_LINE_RE = /^\s*[A-Z][A-Z\s&.'-]{4,}(?:BANK|PJSC|LLC|CORP|N\.A\.|FSB|BSC|PLC)\.?\s*$/;

function isSensitiveLine(line) {
  const trimmed = line.trim();
  if (SENSITIVE_PREFIX_RE.test(trimmed)) return true;
  if (PAGE_NUMBER_RE.test(trimmed)) return true;
  if (TABLE_HEADER_RE.test(trimmed)) return true;
  if (BANK_NAME_LINE_RE.test(trimmed)) return true;
  return false;
}

// ── Inline redaction patterns ─────────────────────────────────────────────────
// Applied to lines that survive the line-removal pass.
// Each pattern must be narrow enough that it cannot match a merchant name.

const REDACT_PATTERNS = [
  // IBAN: country code (2 letters) + check digits (2) + BBAN (11-30 chars).
  // Total minimum 15 chars. IBANs are never just merchant names.
  { name: 'ibans',
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },

  // Card number 4-4-4-4 (with optional spaces or hyphens between groups)
  { name: 'cards',
    re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },

  // Masked account numbers: 3+ X or * followed by 4+ digits
  // e.g. XXXXX1506, ****1234. Also M-XXXXX1506 style.
  { name: 'masked_accounts',
    re: /\bM?-?[X*]{3,}\d{4,}\b/gi },

  // Long bare digit sequences: 10+ consecutive digits not adjacent to a decimal.
  // Account/card numbers are 10-16 digits; amounts and dates never reach 10.
  { name: 'account_numbers',
    re: /(?<![.,])\b\d{10,}\b(?![.,]\d)/g },

  // Context-aware: 7-12 digit numbers that appear right after transfer/account keywords.
  // Catches "MOBN TRANSFER FROM 29114924 TO 29126037" without touching amounts or dates.
  // The keyword is preserved; only the digit portion is replaced.
  { name: 'transfer_accounts',
    re: /\b(FROM|TO|ACCOUNT|ACCT|ACC\s+NO|TRANSFER|TRF|TXN|TRANS)\s+(\d{7,12})\b/gi,
    replacer: (_, keyword) => `${keyword} [REDACTED]` },

  // Known bank reference code formats — whitelist only, no generic matching:
  //   FT + 8 or more alphanumerics  (e.g. FT26063BTF5D)
  //   ROC/ + 8 or more digits       (e.g. ROC/03202606)
  //   "REF:", "Ref:", or "Reference:" followed by an alphanumeric blob
  //   "TXN:" or "Trans ID:" followed by an alphanumeric blob
  { name: 'references',
    re: /\bFT[A-Z0-9]{8,}\b|\bROC\/\d{8,}\b|(?:REF|Ref|Reference|TXN|Trans\s+ID)\s*:\s*[A-Z0-9]{6,}/g },

  // Email addresses
  { name: 'emails',
    re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },

  // International phone numbers starting with +
  { name: 'phones',
    re: /\+\d{8,15}/g },
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
    for (const { name, re, replacer } of REDACT_PATTERNS) {
      const before = out;
      out = replacer ? out.replace(re, replacer) : out.replace(re, '[REDACTED]');
      if (out !== before) {
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
