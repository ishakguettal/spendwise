import db from '../db/database.js';

/**
 * Check whether adding `proposedAmount` to total allocations would violate the invariant:
 *   total_allocated <= total_savings_balance
 *
 * @param {number} proposedAmount - Amount to be added to allocations (negative for reallocation back to pool).
 * @returns {{ valid: boolean, totalSavings: number, totalAllocated: number, unallocated: number }}
 */
export function checkSavingsInvariant(proposedAmount = 0) {
  const { totalSavings } = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS totalSavings FROM transactions WHERE type = 'savings'`
  ).get();

  const { totalAllocated } = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS totalAllocated FROM allocations`
  ).get();

  const unallocated = totalSavings - totalAllocated;
  const newTotalAllocated = totalAllocated + proposedAmount;
  const valid = newTotalAllocated <= totalSavings;

  return { valid, totalSavings, totalAllocated, unallocated };
}
