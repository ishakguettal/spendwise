import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEGMENT_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return Math.round(n ?? 0).toLocaleString();
}

// ── Stat card (slightly smaller than top dashboard cards) ─────────────────────

function StatCard({ label, value, valueClass = 'text-neutral-100' }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-lg font-medium tabular-nums ${valueClass}`}>AED {value}</p>
    </div>
  );
}

// ── Stacked allocation bar ────────────────────────────────────────────────────

function AllocationBar({ savings }) {
  const { total_balance, unallocated, per_goal } = savings;

  if (total_balance <= 0) {
    return (
      <p className="text-sm text-neutral-600">
        Add a savings transaction to start allocating.
      </p>
    );
  }

  const allocated_goals = per_goal.filter((g) => g.allocated > 0);

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px bg-neutral-800">
        {allocated_goals.map((g, i) => (
          <div
            key={g.goal_id}
            style={{
              width: `${(g.allocated / total_balance) * 100}%`,
              backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            }}
          />
        ))}
        {unallocated > 0 && (
          <div
            className="bg-neutral-700"
            style={{ width: `${(unallocated / total_balance) * 100}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {allocated_goals.map((g, i) => (
          <div key={g.goal_id} className="flex items-center gap-1.5 text-xs text-neutral-400">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            <span>{g.goal_name}</span>
            <span className="text-neutral-600 tabular-nums">AED {fmt(g.allocated)}</span>
          </div>
        ))}
        {unallocated > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <div className="w-2 h-2 rounded-full bg-neutral-700 shrink-0" />
            <span>Unallocated</span>
            <span className="text-neutral-600 tabular-nums">AED {fmt(unallocated)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Allocate Modal ────────────────────────────────────────────────────────────

function AllocateModal({ open, savings, onClose }) {
  const { fetchSavings, fetchGoals } = useApp();

  const { unallocated = 0, per_goal = [] } = savings ?? {};

  // deltas[goal_id] = additional amount the user wants to allocate to that goal
  const [deltas, setDeltas]   = useState({});
  const [applying, setApplying] = useState(false);
  const [error, setError]     = useState('');

  // Reset on open
  useEffect(() => {
    if (!open) return;
    const init = {};
    per_goal.forEach((g) => { init[g.goal_id] = 0; });
    setDeltas(init);
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !applying) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, applying, onClose]);

  if (!open) return null;

  const totalDelta = Object.values(deltas).reduce((s, v) => s + (v || 0), 0);
  const remaining  = unallocated - totalDelta;

  function availableFor(goal_id) {
    return remaining + (deltas[goal_id] ?? 0);
  }

  function setDelta(goal_id, raw) {
    const val     = Math.max(0, Number(raw) || 0);
    const clamped = Math.min(val, availableFor(goal_id));
    setDeltas((prev) => ({ ...prev, [goal_id]: clamped }));
  }

  async function handleApply() {
    const toAllocate = per_goal.filter((g) => (deltas[g.goal_id] ?? 0) > 0);
    if (toAllocate.length === 0) { onClose(); return; }

    setApplying(true);
    setError('');
    try {
      for (const g of toAllocate) {
        await api.allocate(g.goal_id, deltas[g.goal_id]);
      }
      await Promise.all([fetchSavings(), fetchGoals()]);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const hasDelta = Object.values(deltas).some((v) => v > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !applying) onClose(); }}
    >
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-lg font-medium">Allocate Savings</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-neutral-500 hover:text-neutral-100 disabled:opacity-40 transition-colors duration-150 p-1 rounded-lg hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Unallocated pool readout */}
        <div className="px-6 pt-5 pb-4 border-b border-neutral-800 shrink-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Remaining unallocated</p>
          <p className={`text-3xl font-semibold tabular-nums transition-colors duration-150 ${remaining > 0 ? 'text-emerald-400' : 'text-neutral-600'}`}>
            AED {fmt(remaining)}
          </p>
          {remaining < 0 && (
            <p className="text-xs text-red-400 mt-1">Over-allocated — reduce some goals</p>
          )}
        </div>

        {/* Goal sliders — scrollable if many */}
        <div className="overflow-y-auto px-6 py-4 space-y-6 flex-1">
          {per_goal.length === 0 && (
            <p className="text-sm text-neutral-500">No active goals to allocate to.</p>
          )}

          {per_goal.map((g) => {
            const delta    = deltas[g.goal_id] ?? 0;
            const maxSlider = availableFor(g.goal_id);

            return (
              <div key={g.goal_id} className="space-y-2">
                {/* Goal name + current allocated */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-100">{g.goal_name}</span>
                  <span className="text-xs text-neutral-500 tabular-nums">
                    AED {fmt(g.allocated)} already allocated
                  </span>
                </div>

                {/* Slider + number input row */}
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(maxSlider, delta)}
                    step={1}
                    value={delta}
                    onChange={(e) => setDelta(g.goal_id, Number(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <input
                    type="number"
                    min={0}
                    max={maxSlider}
                    step={1}
                    value={delta || ''}
                    placeholder="0"
                    onChange={(e) => setDelta(g.goal_id, e.target.value)}
                    className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-neutral-100 tabular-nums text-right focus:border-neutral-600 focus:outline-none transition-colors"
                  />
                </div>

                {/* Delta preview */}
                {delta > 0 && (
                  <p className="text-xs text-emerald-400 tabular-nums">
                    +AED {fmt(delta)} will be allocated
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-neutral-800 shrink-0">
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !hasDelta || remaining < 0}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {applying ? 'Applying…' : 'Apply Allocation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function SavingsSection() {
  const { savings } = useApp();
  const [allocateOpen, setAllocateOpen] = useState(false);

  const totalBalance  = savings?.total_balance  ?? 0;
  const totalAllocated = savings?.total_allocated ?? 0;
  const unallocated   = savings?.unallocated    ?? 0;

  return (
    <>
      <div className="space-y-4">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-neutral-100">Savings</h2>
          <button
            onClick={() => setAllocateOpen(true)}
            disabled={unallocated <= 0}
            className="px-3 py-1.5 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            Allocate
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Saved"  value={fmt(totalBalance)} />
          <StatCard label="Allocated"    value={fmt(totalAllocated)} />
          <StatCard
            label="Unallocated"
            value={fmt(unallocated)}
            valueClass={unallocated > 0 ? 'text-emerald-400' : 'text-neutral-600'}
          />
        </div>

        {/* Stacked bar */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Allocation Breakdown</p>
          {savings ? (
            <AllocationBar savings={savings} />
          ) : (
            <p className="text-sm text-neutral-600">Loading…</p>
          )}
        </div>
      </div>

      <AllocateModal
        open={allocateOpen}
        savings={savings}
        onClose={() => setAllocateOpen(false)}
      />
    </>
  );
}
