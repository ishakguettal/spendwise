import db from '../db/database.js';

/**
 * Delete the insights_cache row for the month containing the given date.
 * Called on every transaction insert, update, or delete.
 * @param {string} date - ISO date string YYYY-MM-DD
 */
export function invalidateInsightsCache(date) {
  const month = date.slice(0, 7); // YYYY-MM
  db.prepare('DELETE FROM insights_cache WHERE month = ?').run(month);
}
