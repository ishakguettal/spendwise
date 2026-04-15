/**
 * Format an amount with the correct currency symbol and grouping.
 *
 * @param {number} amount
 * @param {string} code  - 'AED' | 'USD' | 'EUR' | 'GBP'
 * @returns {string}  e.g. "AED 1,234"  "$1,234"  "€1,234"  "£1,234"
 */
export function formatCurrency(amount, code = 'AED') {
  const n   = Math.round(amount ?? 0);
  const abs = Math.abs(n).toLocaleString('en-US');
  const sign = n < 0 ? '-' : '';
  switch (code) {
    case 'USD': return `${sign}$${abs}`;
    case 'EUR': return `${sign}€${abs}`;
    case 'GBP': return `${sign}£${abs}`;
    default:    return `${sign}AED ${abs}`;  // AED and unknown codes
  }
}

/** Currency symbol only (no amount). */
export function currencySymbol(code = 'AED') {
  switch (code) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default:    return 'AED';
  }
}

export const SUPPORTED_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP'];
