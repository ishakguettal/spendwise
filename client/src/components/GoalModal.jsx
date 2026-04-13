import { useState, useEffect } from 'react';
import { api } from '../api';

const PRIORITIES = ['high', 'medium', 'low'];

const PRIORITY_STYLE = {
  high:   'bg-emerald-500 text-neutral-950 font-medium',
  medium: 'bg-emerald-500 text-neutral-950 font-medium',
  low:    'bg-emerald-500 text-neutral-950 font-medium',
};

// Tomorrow's date in YYYY-MM-DD for the min attribute
function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function GoalModal({ open, goal, onClose, onSaved }) {
  const isEdit = Boolean(goal);

  const [form, setForm]     = useState({ name: '', target_amount: '', deadline: '', priority: 'medium' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setForm({
        name:          goal.name,
        target_amount: String(goal.target_amount),
        deadline:      goal.deadline,
        priority:      goal.priority,
      });
    } else {
      setForm({ name: '', target_amount: '', deadline: '', priority: 'medium' });
    }
    setErrors({});
    setSubmitError('');
  }, [open, goal]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, saving, onClose]);

  if (!open) return null;

  function field(key) {
    return (e) => {
      setForm(prev => ({ ...prev, [key]: e.target.value }));
      setErrors(prev => ({ ...prev, [key]: undefined }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim())                        errs.name          = 'Required';
    if (!form.target_amount || Number(form.target_amount) <= 0) errs.target_amount = 'Must be greater than 0';
    if (!form.deadline)                           errs.deadline      = 'Required';
    else if (form.deadline <= new Date().toISOString().slice(0, 10)) errs.deadline = 'Must be a future date';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    setSubmitError('');
    try {
      const payload = {
        name:          form.name.trim(),
        target_amount: Number(form.target_amount),
        deadline:      form.deadline,
        priority:      form.priority,
      };
      if (isEdit) {
        await api.updateGoal(goal.id, payload);
      } else {
        await api.createGoal(payload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = (err) =>
    `w-full bg-neutral-800 border rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none transition-colors duration-150 ${
      err ? 'border-red-500/60' : 'border-neutral-700'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">{isEdit ? 'Edit Goal' : 'New Goal'}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-neutral-500 hover:text-neutral-100 disabled:opacity-40 transition-colors duration-150 p-1 rounded-lg hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Goal Name</label>
            <input
              type="text"
              value={form.name}
              onChange={field('name')}
              placeholder="e.g. Emergency fund, Vacation, New laptop…"
              className={inputCls(errors.name)}
            />
            {errors.name && <p className="text-xs text-red-400 mt-1.5">{errors.name}</p>}
          </div>

          {/* Target Amount */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Target Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 select-none pointer-events-none">
                AED
              </span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.target_amount}
                onChange={field('target_amount')}
                placeholder="0"
                className={`${inputCls(errors.target_amount)} pl-12 tabular-nums`}
              />
            </div>
            {errors.target_amount && <p className="text-xs text-red-400 mt-1.5">{errors.target_amount}</p>}
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Deadline</label>
            <input
              type="date"
              value={form.deadline}
              min={tomorrow()}
              onChange={field('deadline')}
              className={inputCls(errors.deadline)}
            />
            {errors.deadline && <p className="text-xs text-red-400 mt-1.5">{errors.deadline}</p>}
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                  className={`py-2 text-sm rounded-md capitalize transition-colors duration-150 ${
                    form.priority === p
                      ? p === 'high'
                        ? 'bg-red-500/20 text-red-400 font-medium'
                        : p === 'medium'
                        ? 'bg-amber-500/20 text-amber-400 font-medium'
                        : 'bg-neutral-700 text-neutral-300 font-medium'
                      : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {submitError && <p className="text-xs text-red-400">{submitError}</p>}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
