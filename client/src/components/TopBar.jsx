import { useApp } from '../context/AppContext';

function getLast12Months() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });
  }
  return months;
}

const MONTHS = getLast12Months();

export default function TopBar() {
  const { selectedMonth, setSelectedMonth, openAddModal, openUploadModal } = useApp();

  return (
    <header className="sticky top-0 z-40 h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
      <span className="text-base font-semibold tracking-tight">Spendwise</span>
      <div className="flex items-center gap-3">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700 cursor-pointer transition-colors duration-150"
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button
          onClick={openUploadModal}
          className="px-4 py-1.5 rounded-lg border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
        >
          Upload Statement
        </button>
        <button
          onClick={openAddModal}
          className="px-4 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 transition-colors duration-150"
        >
          + Add
        </button>
      </div>
    </header>
  );
}
