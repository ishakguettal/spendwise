/**
 * Privacy layer for bank statement text.
 *
 * Purpose: ensure that bank-identifying metadata — account numbers, IBANs,
 * bank reference codes, contact details — never leaves the user's session.
 * Only normalised transaction data (dates, amounts, merchant descriptions)
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
// A line is dropped if it starts with one of these labels.
// Match requires the prefix to be immediately followed by a space, colon, or
// end-of-string — so "IBAN:AE..." (no space) and "IBAN" alone both match,
// but "ibanAccount" does not.

const SENSITIVE_LINE_PREFIXES = [
  // Account identity
  'account holder',
  'account name',
  'account number',
  'account no',
  'account #',
  'account id',
  'client name',
  'customer name',
  'customer id',
  'customer no',
  'customer reference',
  // Banking codes
  'iban',
  'swift',
  'bic',
  'sort code',
  'routing number',
  'routing no',
  'branch code',
  'branch name',
  'branch address',
  'ifsc',            // India
  'bsb',             // Australia
  // Personal details
  'address',
  'email',
  'mobile',
  'phone',
  'tel',
  'fax',
  'national id',
  'emirates id',
  'civil id',        // Kuwait / Bahrain
  'passport',
  'date of birth',
  'dob',
  // Statement metadata
  'statement period',
  'statement date',
  'prepared for',
  'prepared by',
];

// Lookahead: prefix must be followed by whitespace, colon, or end-of-string.
// This catches "IBAN: ...", "IBAN:AE...", "IBAN\n" (standalone label), etc.
const SENSITIVE_PREFIX_RE = new RegExp(
  '^(' +
    SENSITIVE_LINE_PREFIXES
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
  ')(?=[\\s:]|$)',
  'i'
);

// "Page X of Y" or bare "X / Y" counting lines
const PAGE_NUMBER_RE = /^\s*(?:page\s+)?\d+\s*[/of]+\s*\d+\s*$/i;

// Lines that are just the column headers of a transaction table
// e.g. "Date  Description  Debit  Credit  Balance"
const TABLE_HEADER_RE = /^\s*(?:(?:date|description|debit|credit|balance|amount|narration|particulars|withdrawals?|deposits?)\s+){2,}$/i;

// Lines that are just an all-caps bank name ending in a legal suffix
const BANK_NAME_LINE_RE = /^\s*[A-Z][A-Z\s&.'-]{4,}(?:BANK|PJSC|LLC|CORP|N\.A\.|FSB|BSC|PLC)\.?\s*$/;

function isSensitiveLine(line) {
  const trimmed = line.trim();
  return (
    SENSITIVE_PREFIX_RE.test(trimmed) ||
    PAGE_NUMBER_RE.test(trimmed)       ||
    TABLE_HEADER_RE.test(trimmed)      ||
    BANK_NAME_LINE_RE.test(trimmed)
  );
}

// ── Inline redaction patterns ─────────────────────────────────────────────────
// Applied to lines that survive the line-removal pass.
// Each pattern must be narrow enough to never match a merchant name.

const REDACT_PATTERNS = [
  // ── IBAN ──────────────────────────────────────────────────────────────────
  // Handles BOTH compact (AE070260001015283794601) and space-separated display
  // format (AE07 0260 0010 1528 3794 601).
  // Structure: 2-letter country code + 2 check digits + BBAN (11–30 chars).
  { name: 'ibans',
    re: /\b[A-Z]{2}\d{2}(?:[A-Z0-9]{4}\s?){2,7}[A-Z0-9]{1,4}\b/g },

  // ── SWIFT / BIC codes ─────────────────────────────────────────────────────
  // 8 or 11 chars: 4-letter bank + 2-letter country + 2 location + optional 3 branch.
  // Only caught when a SWIFT/BIC/Bank Code label immediately precedes them,
  // to avoid colliding with legitimate uppercase product names.
  { name: 'swift_bic',
    re: /(?:SWIFT|BIC|Bank\s+Code)\s*[:/]\s*[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi,
    replacer: (match) => match.replace(/[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/i, '[REDACTED]') },

  // ── Card numbers ──────────────────────────────────────────────────────────
  // 16-digit groups of 4, with optional spaces or hyphens between groups
  { name: 'cards',
    re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },

  // ── Masked account numbers ────────────────────────────────────────────────
  // 3+ X or * followed by 4+ digits — e.g. XXXXX1506, ****1234, M-XXXXX1506
  { name: 'masked_accounts',
    re: /\bM?-?[X*]{3,}\d{4,}\b/gi },

  // ── Long bare digit sequences ─────────────────────────────────────────────
  // 10+ consecutive digits not adjacent to a decimal point.
  // Account/card numbers are 10–16 digits; monetary amounts and dates never reach 10.
  { name: 'account_numbers',
    re: /(?<![.,])\b\d{10,}\b(?![.,]\d)/g },

  // ── Context-aware transfer account numbers ────────────────────────────────
  // Catches "MOBN TRANSFER FROM 29114924 TO 29126037" (7–12-digit numbers that
  // appear directly after a financial keyword). The keyword is preserved.
  { name: 'transfer_accounts',
    re: /\b(FROM|TO|ACCOUNT|ACCT|ACC\s+NO|TRANSFER|TRF|TXN|TRANS)\s+(\d{7,12})\b/gi,
    replacer: (_, keyword) => `${keyword} [REDACTED]` },

  // ── Bank reference codes ──────────────────────────────────────────────────
  // Strict whitelist — only known structural prefixes to avoid catching merchant names.
  //   FT + 8+ alphanumeric   (e.g. FT26063BTF5D — ENBD/ADCB)
  //   CHG + 8+ alphanumeric  (charge reference, common in Gulf banks)
  //   ROC/ + 8+ digits       (e.g. ROC/03202606)
  //   REF/Reference/TXN/Transaction ID/E2E ID: followed by 6+ alphanumeric
  { name: 'references',
    re: /\b(?:FT|CHG)[A-Z0-9]{8,}\b|\bROC\/\d{8,}\b|(?:REF|Ref|Reference|TXN|Trans(?:action)?\s+ID|E2E\s+ID)\s*:\s*[A-Z0-9-]{6,}/g },

  // ── Email addresses ───────────────────────────────────────────────────────
  { name: 'emails',
    re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },

  // ── Phone numbers ─────────────────────────────────────────────────────────
  // International format (+XX...) — local formats are too ambiguous to catch safely
  { name: 'phones',
    re: /\+\d{8,15}/g },
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Sanitize raw bank statement text before sending to the LLM or storing.
 *
 * Returns cleaned text plus a report: how many lines were dropped and how
 * many inline substitutions were made per pattern. Lines dropped by the
 * prefix filter are scanned for IBAN/account patterns so those counts are
 * included in the report even when the whole line is removed.
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

  // Initialise counts
  const redactions_applied = Object.fromEntries(
    REDACT_PATTERNS.map(p => [p.name, 0])
  );

  for (const line of lines) {
    if (isSensitiveLine(line)) {
      removed_lines_count++;
      // Count PII patterns within the removed line so the report is accurate
      // even when the whole line is dropped rather than inline-redacted.
      for (const { name, re } of REDACT_PATTERNS) {
        const m = line.match(new RegExp(re.source, re.flags));
        if (m) redactions_applied[name] += m.length;
      }
    } else {
      kept.push(line);
    }
  }

  // Apply inline redactions to surviving lines
  const redacted = kept.map(line => {
    let out = line;
    for (const { name, re, replacer } of REDACT_PATTERNS) {
      const before = out;
      out = replacer ? out.replace(re, replacer) : out.replace(re, '[REDACTED]');
      if (out !== before) {
        const hits = before.match(new RegExp(re.source, re.flags));
        redactions_applied[name] += hits ? hits.length : 1;
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
