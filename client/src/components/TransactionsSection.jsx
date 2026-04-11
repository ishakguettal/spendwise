import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

const CATEGORIES = [
  'Food','Groceries','Transport','Rent','Bills','Subscriptions',
  'Entertainment','Shopping','Health','Education','Travel','Income','Savings','Other',
];

function fmt(n) {
  return Math.round(n).toLocaleString();
}

function amountColor(type) {
  if (type === 'income')  return 'text-emerald-400';
  if (type === 'expense') return 'text-red-400';
  return 'text-sky-400'; // savings
}

function amountDisplay(t) {
  const prefix = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  return `${prefix}AED ${fmt(t.amount)}`;
}

export default function TransactionsSection() {
  const { transactions } = useApp();
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType]         = useState('');
  const [search, setSearch]                 = useState('');

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterType     && t.type !== filterType)         return false;
      if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, filterCategory, filterType, search]);

  return (
    <div className="rounded-2xl border border-neutral-800 p-6">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-base font-medium">
          Transactions
          <span className="ml-2 text-sm font-normal text-neutral-600">
            {filtered.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-700"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-700"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-700"
          >
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="savings">Savings</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-neutral-500">
              <th className="pb-3 pr-4 font-medium">Date</th>
              <th className="pb-3 pr-4 font-medium">Description</th>
              <th className="pb-3 pr-4 font-medium">Category</th>
              <th className="pb-3 pr-4 font-medium">Type</th>
              <th className="pb-3 pr-4 font-medium text-right">Amount</th>
              <th className="pb-3 pr-4 font-medium">Source</th>
              <th className="pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-neutral-600 text-sm">
                  No transactions match your filters
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-neutral-900 hover:bg-neutral-900/50 transition-colors"
                >
                  <td className="py-3 pr-4 text-neutral-500 tabular-nums whitespace-nowrap">{t.date}</td>
                  <td className="py-3 pr-4 text-neutral-200 max-w-xs truncate">
                    {t.description ?? <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="px-2 py-0.5 rounded-lg bg-neutral-800 text-neutral-300 text-xs">
                      {t.category}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-neutral-400 capitalize">{t.type}</td>
                  <td className={`py-3 pr-4 text-right font-medium tabular-nums ${amountColor(t.type)}`}>
                    {amountDisplay(t)}
                  </td>
                  <td className="py-3 pr-4 text-xs text-neutral-600 capitalize">{t.source}</td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button className="text-xs text-neutral-500 hover:text-neutral-200 transition-colors">
                        Edit
                      </button>
                      <button className="text-xs text-neutral-500 hover:text-red-400 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
