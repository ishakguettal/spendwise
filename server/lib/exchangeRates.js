/**
 * Exchange rate helper.
 *
 * Rates are fetched from open.er-api.com (free tier, no key needed) and cached
 * in the exchange_rates table for up to CACHE_HOURS. On any fetch failure the
 * last-known cached value is used so the app never crashes due to network issues.
 *
 * Internal math: all transaction amounts are stored in AED. This module converts
 * at the response boundary (display) and input boundary (user-entered amounts).
 */

import db from '../db/database.js';

const SUPPORTED   = ['AED', 'USD', 'EUR', 'GBP'];
const CACHE_HOURS = 12;
const API_URL     = 'https://open.er-api.com/v6/latest/AED';

// ── Fetch & persist ───────────────────────────────────────────────────────────

// Single in-flight promise — concurrent callers wait on the same fetch
// rather than each firing their own API request.
let _fetchPromise = null;

async function fetchAndCache() {
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.result !== 'success') throw new Error(`API error: ${json['error-type']}`);

      const { rates } = json;
      const now = new Date().toISOString();

      const upsert = db.prepare(`
        INSERT INTO exchange_rates (base_currency, target_currency, rate, fetched_at)
        VALUES ('AED', ?, ?, ?)
        ON CONFLICT(base_currency, target_currency)
        DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at
      `);

      for (const cur of SUPPORTED) {
        if (cur === 'AED') continue;
        if (typeof rates[cur] === 'number') upsert.run(cur, rates[cur], now);
      }

      console.log(
        '[exchangeRates] Refreshed:',
        SUPPORTED.filter(c => c !== 'AED').map(c => `AED→${c}=${rates[c]?.toFixed(4)}`).join('  ')
      );
      return true;
    } catch (err) {
      console.warn('[exchangeRates] Fetch failed:', err.message);
      return false;
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

// ── Cache reads ───────────────────────────────────────────────────────────────

function freshRate(to) {
  const row = db.prepare(
    `SELECT rate FROM exchange_rates
     WHERE base_currency='AED' AND target_currency=?
       AND fetched_at > datetime('now', ?)`
  ).get(to, `-${CACHE_HOURS} hours`);
  return row ? row.rate : null;
}

function staleRate(to) {
  const row = db.prepare(
    `SELECT rate FROM exchange_rates WHERE base_currency='AED' AND target_currency=?`
  ).get(to);
  return row ? row.rate : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the conversion rate from `from` to `to`.
 * Returns a multiplier: converted = amount * getRate(from, to).
 * Falls back to stale cache on fetch failure; returns 1 as absolute last resort.
 */
export async function getRate(from, to) {
  if (from === to) return 1;

  // All stored rates are AED-based
  if (from === 'AED') {
    // Fast path: valid cached rate
    const cached = freshRate(to);
    if (cached !== null) return cached;

    // Cache expired (or empty) — fetch once; concurrent calls share the promise
    await fetchAndCache();

    // Use freshly written rate if fetch succeeded
    const fresh = freshRate(to);
    if (fresh !== null) return fresh;

    // Fetch failed — fall back to whatever stale value we have
    const stale = staleRate(to);
    if (stale !== null) {
      console.warn(`[exchangeRates] Using stale rate AED→${to} after failed refresh: ${stale}`);
      return stale;
    }
    console.warn(`[exchangeRates] No rate for AED→${to}, using 1`);
    return 1;
  }

  if (to === 'AED') {
    const r = await getRate('AED', from);
    return r > 0 ? 1 / r : 1;
  }

  // Cross-rate via AED
  const [toAed, aedTo] = await Promise.all([getRate(from, 'AED'), getRate('AED', to)]);
  return toAed * aedTo;
}

/** Convert amount from one currency to another. */
export async function convert(amount, from, to) {
  if (from === to) return amount;
  return amount * (await getRate(from, to));
}

/**
 * Return the current AED→displayCurrency rate synchronously from cache.
 * Used for display-only conversions where awaiting is inconvenient.
 * Returns 1 if no cached rate exists (safe fallback).
 */
export function getCachedRate(to) {
  if (to === 'AED') return 1;
  return staleRate(to) ?? 1;
}

/** Called on server boot to warm the cache if no rates are stored yet. */
export async function initRates() {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM exchange_rates`).get();
  if (n === 0) {
    console.log('[exchangeRates] No cached rates — fetching on boot...');
    await fetchAndCache();
  }
}
