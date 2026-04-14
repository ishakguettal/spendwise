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

function formatDateHeader(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) {
    return (
      <svg className="w-3 h-3 text-neutral-700 inline ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    );
  }
  return sortDir === 'asc' ? (
    <svg className="w-3 h-3 text-emerald-400 inline ml-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-emerald-400 inline ml-1" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

export default function TransactionsSection() {
  const { transactions, selectedMonth, openEditModal, openDeleteModal } = useApp();
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [search,         setSearch]         = useState('');
  const [sortBy,         setSortBy]         = useState('date');
  const [sortDir,        setSortDir]        = useState('desc');

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  }

  const filtered = useMemo(() => transactions.filter((t) => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterType     && t.type     !== filterType)     return false;
    if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [transactions, filterCategory, filterType, search]);

  // Group by date, dates sorted by sortDir when sortBy === 'date'
  // Within each date group, sort transactions by the active sort column
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of filtered) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }

    // Sort within each group
    for (const txs of map.values()) {
      txs.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'date')        cmp = a.date.localeCompare(b.date);
        else if (sortBy === 'amount') cmp = a.amount - b.amount;
        else if (sortBy === 'description') cmp = (a.description ?? '').localeCompare(b.description ?? '');
        else if (sortBy === 'category')    cmp = a.category.localeCompare(b.category);
        else if (sortBy === 'type')        cmp = a.type.localeCompare(b.type);
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    // Sort date groups
    const entries = [...map.entries()];
    entries.sort(([a], [b]) => sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
    return entries;
  }, [filtered, sortBy, sortDir]);

  const thCls = 'pb-2 text-[10px] uppercase tracking-wide text-neutral-600 font-medium cursor-pointer hover:text-neutral-400 select-none transition-colors duration-100';

  return (
    <div>
      {/* Section header — outside the card */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-semibold text-neutral-100">
          Transactions
          <span className="ml-2 text-sm font-normal text-neutral-600">{filtered.length}</span>
        </h2>
      </div>

    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">

      {/* Pill filter */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
        <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-full px-3 py-1 gap-2">
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-24 bg-transparent text-xs text-neutral-300 placeholder-neutral-700 focus:outline-none"
          />
          <div className="w-px h-3 bg-neutral-800 shrink-0" />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-transparent text-xs text-neutral-500 focus:outline-none cursor-pointer">
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="w-px h-3 bg-neutral-800 shrink-0" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="bg-transparent text-xs text-neutral-500 focus:outline-none cursor-pointer">
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="savings">Savings</option>
          </select>
        </div>
      </div>

      {transactions.length === 0 && (
        <p className="mb-3 text-xs text-neutral-600">
          No transactions for {formatMonthLabel(selectedMonth)}.
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className={`${thCls} pr-4 text-left`} onClick={() => toggleSort('date')}>
                Date <SortIcon col="date" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className={`${thCls} pr-4 text-left`} onClick={() => toggleSort('description')}>
                Description <SortIcon col="description" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className={`${thCls} pr-4 text-left`} onClick={() => toggleSort('category')}>
                Category <SortIcon col="category" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className={`${thCls} pr-4 text-left`} onClick={() => toggleSort('type')}>
                Type <SortIcon col="type" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('amount')}>
                Amount <SortIcon col="amount" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className="pb-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-700 text-xs">
                  {transactions.length === 0 ? '' : 'No transactions match your filters'}
                </td>
              </tr>
            ) : groups.map(([date, txs]) => {
              const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
              const income   = txs.filter(t => t.type === 'income').reduce((s, t)  => s + t.amount, 0);
              return (
                <>
                  {/* Date group header */}
                  <tr key={`h-${date}`}>
                    <td colSpan={6} className="py-0">
                      <div className="flex items-center justify-between bg-neutral-900/40 px-0 py-1.5 mt-1 rounded-sm">
                        <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                          {formatDateHeader(date)}
                        </span>
                        <span className="text-xs text-neutral-600 tabular-nums">
                          {txs.length} txn{txs.length !== 1 ? 's' : ''}
                          {expenses > 0 && ` • −AED ${fmt(expenses)}`}
                          {income   > 0 && ` • +AED ${fmt(income)}`}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* Transaction rows */}
                  {txs.map((t) => (
                    <tr key={t.id}
                      className="border-b border-neutral-900 hover:bg-neutral-800/30 transition-colors duration-150 group"
                      style={{ height: 30 }}>
                      <td className="pr-4 text-neutral-500 tabular-nums whitespace-nowrap">{t.date}</td>
                      <td className="pr-4 max-w-[200px]">
                        <span className="text-neutral-300 truncate block">
                          {t.description ?? <span className="text-neutral-700">—</span>}
                        </span>
                      </td>
                      <td className="pr-4">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800/60 text-neutral-500">{t.category}</span>
                      </td>
                      <td className="pr-4 text-neutral-600 capitalize">{t.type}</td>
                      <td className={`text-right font-medium tabular-nums ${amountColor(t.type)}`}>
                        {amountDisplay(t)}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button onClick={() => openEditModal(t)} title="Edit"
                            className="p-1 text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors duration-150">
                            <IconEdit />
                          </button>
                          <button onClick={() => openDeleteModal(t)} title="Delete"
                            className="p-1 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors duration-150">
                            <IconDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
