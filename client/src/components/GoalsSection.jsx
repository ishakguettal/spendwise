import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import GoalModal from './GoalModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return Math.round(n).toLocaleString();
}

function isOnTrack(goal) {
  const created  = new Date(goal.created_at + 'T00:00:00').getTime();
  const deadline = new Date(goal.deadline   + 'T00:00:00').getTime();
  const today    = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  const total    = deadline - created;
  if (total <= 0) return goal.progress_pct >= 100;
  const elapsed_pct = Math.max(0, Math.min(100, ((today - created) / total) * 100));
  return goal.progress_pct >= elapsed_pct;
}

const PRIORITY_BADGE = {
  high:   'bg-red-500/10 text-red-400',
  medium: 'bg-amber-500/10 text-amber-400',
  low:    'bg-neutral-800 text-neutral-400',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function IconChevron({ down }) {
  return (
    <svg
      className={`w-4 h-4 text-neutral-600 transition-transform duration-200 ${down ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  );
}

function DaysLabel({ days }) {
  if (days > 0)  return <span className="text-xs text-neutral-500">{days} day{days !== 1 ? 's' : ''} left</span>;
  if (days === 0) return <span className="text-xs text-amber-400">Due today</span>;
  return <span className="text-xs text-red-400">Deadline passed</span>;
}

// ── Per-goal allocation modal ─────────────────────────────────────────────────

function GoalAllocateModal({ goal, unallocated, onClose }) {
  const { fetchSavings, fetchGoals } = useApp();

  const maxAmount = Math.max(0, Math.min(unallocated, goal.target_amount - goal.allocated));

  const [amount,   setAmountRaw] = useState(0);
  const [applying, setApplying]  = useState(false);
  const [error,    setError]     = useState('');

  useEffect(() => {
    setAmountRaw(0);
    setError('');
  }, [goal?.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !applying) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [applying, onClose]);

  function setAmount(raw) {
    const val = Math.max(0, Math.min(Number(raw) || 0, maxAmount));
    setAmountRaw(val);
  }

  const newAllocated  = goal.allocated + amount;
  const newPct        = goal.target_amount > 0
    ? Math.min(100, Math.round((newAllocated / goal.target_amount) * 100))
    : 0;

  async function handleApply() {
    if (amount <= 0) { onClose(); return; }
    setApplying(true);
    setError('');
    try {
      await api.allocate(goal.id, amount);
      await Promise.all([fetchSavings(), fetchGoals()]);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !applying) onClose(); }}
    >
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-medium text-neutral-100">Allocate to Goal</h2>
            <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-xs">{goal.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-neutral-500 hover:text-neutral-100 disabled:opacity-40 p-1 rounded-lg hover:bg-neutral-800 transition-colors duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Context row */}
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Currently allocated: <span className="text-neutral-300 tabular-nums">AED {fmt(goal.allocated)}</span></span>
            <span>Target: <span className="text-neutral-300 tabular-nums">AED {fmt(goal.target_amount)}</span></span>
          </div>

          {/* Slider + number input */}
          <div className="space-y-3">
            <label className="text-xs uppercase tracking-wide text-neutral-500">Add to this goal</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={maxAmount}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 accent-emerald-500"
              />
              <input
                type="number"
                min={0}
                max={maxAmount}
                step={1}
                value={amount || ''}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
                className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-neutral-100 tabular-nums text-right focus:border-neutral-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Preview */}
          {amount > 0 ? (
            <div className="rounded-xl bg-neutral-800 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">New allocated</span>
                <span className="text-neutral-100 tabular-nums font-medium">AED {fmt(newAllocated)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">Progress</span>
                <span className="text-emerald-400 tabular-nums">{newPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-700 overflow-hidden mt-2">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${newPct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-600">
              Unallocated pool: <span className="tabular-nums">AED {fmt(unallocated)}</span>
            </p>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-5">
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
            disabled={applying || amount <= 0}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {applying ? 'Allocating…' : 'Allocate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

// ── Feasibility badge ─────────────────────────────────────────────────────────

const FEASIBILITY_STYLE = {
  easy:       { cls: 'bg-emerald-500/10 text-emerald-400', label: 'Easy' },
  moderate:   { cls: 'bg-amber-500/10 text-amber-400',     label: 'Moderate' },
  aggressive: { cls: 'bg-red-500/10 text-red-400',         label: 'Aggressive' },
  infeasible: { cls: 'bg-red-500/10 text-red-400',         label: 'Infeasible' },
};

function FeasibilityBadge({ f }) {
  const { cls, label } = FEASIBILITY_STYLE[f] ?? FEASIBILITY_STYLE.moderate;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-md font-medium flex items-center gap-1 ${cls}`}>
      {f === 'infeasible' && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      )}
      {label}
    </span>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, goalPlan, unallocated, onEdit, onDelete, onAllocate }) {
  const [expanded, setExpanded] = useState(false);
  const barPct      = Math.min(100, goal.progress_pct);
  const canAllocate = unallocated > 0 && goal.allocated < goal.target_amount;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-neutral-800/40 transition-colors duration-150"
      >
        <IconChevron down={expanded} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-medium text-neutral-100 truncate">{goal.name}</span>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-md capitalize ${PRIORITY_BADGE[goal.priority] ?? PRIORITY_BADGE.low}`}>
              {goal.priority}
            </span>
            {goalPlan && <FeasibilityBadge f={goalPlan.feasibility} />}
          </div>

          <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${barPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs tabular-nums text-neutral-500">
              AED {fmt(goal.allocated)} / {fmt(goal.target_amount)} allocated
              <span className="ml-1.5 text-neutral-600">({goal.progress_pct}%)</span>
            </span>
            <DaysLabel days={goal.days_remaining} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onAllocate(goal)}
            disabled={!canAllocate}
            title={!canAllocate ? (unallocated <= 0 ? 'No unallocated savings' : 'Goal fully funded') : 'Allocate savings to this goal'}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-emerald-800 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
          >
            + Allocate
          </button>
          <button
            onClick={() => onEdit(goal)}
            title="Edit"
            className="p-1.5 text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors duration-150"
          >
            <IconEdit />
          </button>
          <button
            onClick={() => onDelete(goal)}
            title="Delete"
            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors duration-150"
          >
            <IconDelete />
          </button>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-5 pb-5 pt-4 border-t border-neutral-800 space-y-4">
          {goalPlan ? (
            <>
              {/* Monthly contribution + feasibility */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Monthly contribution</p>
                  <p className="text-2xl font-semibold tabular-nums text-neutral-100">
                    AED {fmt(goalPlan.monthly_contribution)}
                    <span className="text-sm font-normal text-neutral-500 ml-1">/mo</span>
                  </p>
                </div>
                <FeasibilityBadge f={goalPlan.feasibility} />
              </div>

              {/* Suggested deadline extension */}
              {goalPlan.suggested_new_deadline && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  Suggested: extend deadline to {goalPlan.suggested_new_deadline}
                </p>
              )}

              {/* Reasoning */}
              {goalPlan.reasoning && (
                <p className="text-sm text-neutral-500 leading-relaxed">{goalPlan.reasoning}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-600 italic">
              Cut plan will appear here once generated.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteGoalModal({ goal, onClose, onConfirm }) {
  if (!goal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h2 className="text-base font-medium text-neutral-100 mb-2">Delete goal</h2>
        <p className="text-sm text-neutral-400 mb-6">
          Deleting this goal will return{' '}
          <span className="text-neutral-200 font-medium">AED {fmt(goal.allocated)}</span>{' '}
          to your unallocated savings pool. Continue?
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 transition-colors duration-150"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function GoalsSection() {
  const { goals, fetchGoals, fetchSavings, savings, addToast } = useApp();

  const [modalOpen,     setModalOpen]     = useState(false);
  const [editGoal,      setEditGoal]      = useState(null);
  const [deleteGoal,    setDeleteGoal]    = useState(null);
  const [allocateGoal,  setAllocateGoal]  = useState(null);
  const [plan,          setPlan]          = useState(null);
  const [planLoading,   setPlanLoading]   = useState(false);

  const unallocated   = savings?.unallocated ?? 0;
  const activeGoals   = goals.filter(g => g.status === 'active');
  const onTrackCount  = activeGoals.filter(isOnTrack).length;
  const behindCount   = activeGoals.length - onTrackCount;

  function openNew()       { setEditGoal(null); setModalOpen(true); }
  function openEdit(goal)  { setEditGoal(goal); setModalOpen(true); }
  function closeModal()    { setModalOpen(false); setEditGoal(null); }

  async function handleDelete() {
    if (!deleteGoal) return;
    try {
      await api.deleteGoal(deleteGoal.id);
      setDeleteGoal(null);
      await Promise.all([fetchGoals(), fetchSavings()]);
      addToast('Goal deleted');
    } catch (err) {
      addToast(`Error: ${err.message}`);
      setDeleteGoal(null);
    }
  }

  async function handleGeneratePlan() {
    setPlanLoading(true);
    try {
      const result = await api.generatePlan();
      if (result.overall_feasible === null && result.error) {
        addToast(`Plan error: ${result.error}`);
      } else {
        setPlan(result);
      }
    } catch (err) {
      addToast(`Plan failed: ${err.message}`);
    } finally {
      setPlanLoading(false);
    }
  }

  // Index per-goal plan by goal_id for O(1) lookup
  const planByGoalId = {};
  if (plan?.per_goal_plan) {
    for (const p of plan.per_goal_plan) planByGoalId[p.goal_id] = p;
  }

  return (
    <>
      <div className="space-y-4">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-neutral-100">Goals</h2>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 transition-colors duration-150"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Goal
          </button>
        </div>

        {/* Infeasibility banner */}
        {plan?.overall_feasible === false && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-amber-300 leading-relaxed">
              These goals can&apos;t all be hit on your current income. See suggested deadline adjustments below.
            </p>
          </div>
        )}

        {/* Summary strip */}
        {activeGoals.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm text-neutral-500">
              <span className="text-neutral-300 font-medium">{activeGoals.length}</span> active
              {' • '}
              <span className="text-emerald-400 font-medium">{onTrackCount}</span> on track
              {' • '}
              <span className={behindCount > 0 ? 'text-red-400 font-medium' : 'text-neutral-500'}>
                {behindCount}
              </span>{' '}
              behind
            </p>
            {plan && plan.overall_feasible !== null && (
              <p className="text-sm text-neutral-500">
                Plan: save{' '}
                <span className="text-neutral-200 font-medium tabular-nums">
                  AED {fmt(plan.monthly_savings_target)}/mo
                </span>
                {' — '}
                Feasible:{' '}
                <span className={plan.overall_feasible ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                  {plan.overall_feasible ? 'Yes' : 'No'}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Cards or empty state */}
        {goals.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-6 py-12 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-neutral-400 mb-1">No goals yet</p>
              <p className="text-xs text-neutral-600">Set your first savings goal to start tracking progress.</p>
            </div>
            <button
              onClick={openNew}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 transition-colors duration-150"
            >
              + New Goal
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                goalPlan={planByGoalId[goal.id] ?? null}
                unallocated={unallocated}
                onEdit={openEdit}
                onDelete={setDeleteGoal}
                onAllocate={setAllocateGoal}
              />
            ))}
          </div>
        )}

        {/* Category cuts — only when plan exists and has cuts */}
        {plan?.category_cuts?.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Suggested Spending Cuts</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plan.category_cuts.map((cut) => (
                <div
                  key={cut.category}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-200">{cut.category}</span>
                    <span className="text-xs text-emerald-400 tabular-nums font-medium">
                      −AED {fmt(cut.reduction)}/mo
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 tabular-nums">
                    AED {fmt(cut.current_avg)} → AED {fmt(cut.target_avg)} avg
                  </p>
                  <p className="text-xs text-neutral-600 leading-relaxed">{cut.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan notes */}
        {plan?.notes && (
          <p className="text-sm text-neutral-500 italic">{plan.notes}</p>
        )}

        {/* Recalculate plan button — full width, secondary */}
        {goals.length > 0 && (
          <button
            onClick={handleGeneratePlan}
            disabled={planLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {planLoading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating plan…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {plan ? 'Recalculate plan' : 'Generate savings plan'}
              </>
            )}
          </button>
        )}
      </div>

      <GoalModal
        open={modalOpen}
        goal={editGoal}
        onClose={closeModal}
        onSaved={fetchGoals}
      />

      <DeleteGoalModal
        goal={deleteGoal}
        onClose={() => setDeleteGoal(null)}
        onConfirm={handleDelete}
      />

      {allocateGoal && (
        <GoalAllocateModal
          goal={allocateGoal}
          unallocated={unallocated}
          onClose={() => setAllocateGoal(null)}
        />
      )}
    </>
  );
}
