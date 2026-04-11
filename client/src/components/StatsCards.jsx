import { useApp } from '../context/AppContext';

function fmt(n) {
  return `AED ${Math.round(n ?? 0).toLocaleString()}`;
}

function Card({ label, value, colorClass }) {
  return (
    <div className="rounded-2xl border border-neutral-800 p-6">
      <p className="text-sm text-neutral-500 mb-2">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}

export default function StatsCards() {
  const { summary } = useApp();
  const income   = summary?.income   ?? 0;
  const expenses = summary?.expenses ?? 0;
  const net      = summary?.net      ?? 0;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card label="Income"  value={fmt(income)}   colorClass="text-emerald-400" />
      <Card label="Spent"   value={fmt(expenses)}  colorClass="text-red-400" />
      <Card
        label="Net"
        value={fmt(net)}
        colorClass={net >= 0 ? 'text-emerald-400' : 'text-red-400'}
      />
    </div>
  );
}
