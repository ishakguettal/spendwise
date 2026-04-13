import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

const CATEGORIES = [
  'Food','Groceries','Transport','Rent','Bills','Subscriptions',
  'Entertainment','Shopping','Health','Education','Travel','Income','Savings','Other',
];

function fmt(n) { return Math.round(n).toLocaleString(); }

function amountColor(type) {
  if (type === 'income')  return 'text-emerald-400';
  if (type === 'expense') return 'text-red-400';
  return 'text-sky-400';
}

function amountDisplay(t) {
  const prefix = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  return `${prefix}AED ${fmt(t.amount)}`;
}

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

function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function TransactionsSection() {
  const { transactions, selectedMonth, openEditModal, openDeleteModal } = useApp();
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [search,         setSearch]         = useState('');

  const filtered = useMemo(() => transactions.filter((t) => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterType     && t.type     !== filterType)     return false;
    if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [transactions, filterCategory, filterType, search]);

  const selectCls = 'bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700 transition-colors duration-150';

  return (
    <div className="rounded-2xl border border-neutral-800 p-6">

      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-medium">
          Transactions
          <span className="ml-2 text-sm font-normal text-neutral-600">{filtered.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-700 transition-colors duration-150"
          />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={selectCls}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectCls}>
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="savings">Savings</option>
          </select>
        </div>
      </div>

      {/* Per-month empty note */}
      {transactions.length === 0 && (
        <p className="mb-4 text-sm text-neutral-500">
          No transactions for {formatMonthLabel(selectedMonth)}.
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="pb-3 pr-4 text-left text-xs uppercase tracking-wide text-neutral-500 font-medium">Date</th>
              <th className="pb-3 pr-4 text-left text-xs uppercase tracking-wide text-neutral-500 font-medium">Description</th>
              <th className="pb-3 pr-4 text-left text-xs uppercase tracking-wide text-neutral-500 font-medium">Category</th>
              <th className="pb-3 pr-4 text-left text-xs uppercase tracking-wide text-neutral-500 font-medium">Type</th>
              <th className="pb-3 pr-4 text-right text-xs uppercase tracking-wide text-neutral-500 font-medium">Amount</th>
              <th className="pb-3 pr-4 text-left text-xs uppercase tracking-wide text-neutral-500 font-medium">Source</th>
              <th className="pb-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-600 text-sm">
                  {transactions.length === 0 ? '' : 'No transactions match your filters'}
                </td>
              </tr>
            ) : filtered.map((t) => (
              <tr key={t.id} className="border-b border-neutral-900 hover:bg-neutral-900 transition-colors duration-150 group">
                <td className="py-3 pr-4 text-neutral-500 tabular-nums whitespace-nowrap">{t.date}</td>
                <td className="py-3 pr-4 text-neutral-200 max-w-xs truncate">
                  {t.description ?? <span className="text-neutral-600">—</span>}
                </td>
                <td className="py-3 pr-4">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-800/60 text-neutral-400">
                    {t.category}
                  </span>
                </td>
                <td className="py-3 pr-4 text-neutral-500 capitalize">{t.type}</td>
                <td className={`py-3 pr-4 text-right font-medium tabular-nums ${amountColor(t.type)}`}>
                  {amountDisplay(t)}
                </td>
                <td className="py-3 pr-4">
                  <span className="text-xs text-neutral-600 capitalize">{t.source}</span>
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => openEditModal(t)}
                      title="Edit"
                      className="p-1.5 text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors duration-150"
                    >
                      <IconEdit />
                    </button>
                    <button
                      onClick={() => openDeleteModal(t)}
                      title="Delete"
                      className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors duration-150"
                    >
                      <IconDelete />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
