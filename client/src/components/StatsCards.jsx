import { useApp } from '../context/AppContext';
import { formatCurrency } from '../lib/formatCurrency';

function Card({ label, value, colorClass }) {
  return (
    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-xl font-medium tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}

export default function StatsCards() {
  const { summary, displayCurrency } = useApp();
  const income   = summary?.income   ?? 0;
  const expenses = summary?.expenses ?? 0;
  const net      = summary?.net      ?? 0;

  // When the month has no transactions every value is 0 — render muted
  const hasData = income > 0 || expenses > 0;
  const fmt = (n) => formatCurrency(n, displayCurrency);

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card label="Income" value={fmt(income)}
        colorClass={hasData && income > 0 ? 'text-emerald-400' : 'text-neutral-600'} />
      <Card label="Spent"  value={fmt(expenses)}
        colorClass={hasData && expenses > 0 ? 'text-red-400'    : 'text-neutral-600'} />
      <Card
        label="Net"
        value={fmt(net)}
        colorClass={!hasData ? 'text-neutral-600' : net >= 0 ? 'text-emerald-400' : 'text-red-400'}
      />
    </div>
  );
}
