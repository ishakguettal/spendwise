import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';

const CATEGORIES = [
  'Food','Groceries','Transport','Rent','Bills','Subscriptions',
  'Entertainment','Shopping','Health','Education','Travel','Income','Other',
];

const TYPES = ['income', 'expense', 'savings'];

export default function TransactionModal({ open, transaction, onClose }) {
  const { refetch, addToast } = useApp();

  const [form, setForm]               = useState({ type: 'expense', amount: '', date: '', category: '', description: '' });
  const [errors, setErrors]           = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(transaction);

  // Reset form each time the modal opens
  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    if (transaction) {
      setForm({
        type:        transaction.type,
        amount:      String(transaction.amount),
        date:        transaction.date,
        category:    transaction.category,
        description: transaction.description ?? '',
      });
    } else {
      // '' category = "Auto-categorize with AI" (backend handles it)
      setForm({ type: 'expense', amount: '', date: today, category: '', description: '' });
    }
    setErrors({});
    setSubmitError('');
  }, [open, transaction]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  function handleTypeChange(newType) {
    setForm(prev => {
      let cat = prev.category;
      if (newType === 'income')  cat = 'Income';   // sensible default for income
      if (newType === 'savings') cat = 'Savings';  // hidden, forced on backend too
      if (newType === 'expense' && ['Income', 'Savings'].includes(cat)) cat = ''; // reset to AI
      return { ...prev, type: newType, category: cat };
    });
  }

  function field(key) {
    return (e) => {
      setForm(prev => ({ ...prev, [key]: e.target.value }));
      setErrors(prev => ({ ...prev, [key]: undefined }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.amount || Number(form.amount) <= 0) errs.amount = 'Must be greater than 0';
    if (!form.date) errs.date = 'Required';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        type:   form.type,
        amount: Number(form.amount),
        date:   form.date,
        // omit category if empty → backend will auto-categorize via Gemini
        // force 'Savings' for savings type (backend also enforces this)
        ...(form.type === 'savings'
          ? { category: 'Savings' }
          : form.category
          ? { category: form.category }
          : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      };
      if (isEdit) {
        await api.updateTransaction(transaction.id, payload);
        addToast('Transaction updated');
      } else {
        await api.createTransaction(payload);
        addToast('Transaction added');
      }
      // Close immediately — don't block on refetch (insights can take up to 45s)
      onClose();
      refetch();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputCls = (err) =>
    `w-full bg-neutral-800 border rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none transition-colors duration-150 ${
      err ? 'border-red-500/60' : 'border-neutral-700'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">{isEdit ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-100 transition-colors duration-150 p-1 rounded-lg hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Type */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Type</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
              {TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`py-2 text-sm rounded-md capitalize transition-colors duration-150 ${
                    form.type === t
                      ? 'bg-emerald-500 text-neutral-950 font-medium'
                      : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 select-none pointer-events-none">
                AED
              </span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.amount}
                onChange={field('amount')}
                placeholder="0"
                className={`${inputCls(errors.amount)} pl-12 tabular-nums`}
              />
            </div>
            {errors.amount && <p className="text-xs text-red-400 mt-1.5">{errors.amount}</p>}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={field('date')}
              className={inputCls(errors.date)}
            />
            {errors.date && <p className="text-xs text-red-400 mt-1.5">{errors.date}</p>}
          </div>

          {/* Category — hidden for savings */}
          {form.type !== 'savings' && (
            <div>
              <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">Category</label>
              <select
                value={form.category}
                onChange={field('category')}
                className={inputCls(false)}
              >
                <option value="">✦ Auto-categorize with AI</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-xs uppercase tracking-wide text-neutral-500 block mb-2">
              Description{' '}
              <span className="normal-case text-neutral-600 tracking-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={field('description')}
              placeholder="e.g. Supermarket run, monthly salary…"
              className={inputCls(false)}
            />
          </div>

          {/* Submit error */}
          {submitError && <p className="text-xs text-red-400">{submitError}</p>}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
