import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';

const PIE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6',
];

function shortMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm">
      <p className="text-neutral-300 font-medium">{payload[0].name}</p>
      <p className="text-neutral-100">AED {Math.round(payload[0].value).toLocaleString()}</p>
    </div>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm space-y-1">
      <p className="text-neutral-500 text-xs">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill }}>
          {p.dataKey}: AED {Math.round(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function ChartsSection() {
  const { summary } = useApp();

  const pieData = (summary?.by_category ?? []).filter((d) => d.total > 0);
  const barData = (summary?.trend_6mo ?? []).map((d) => ({
    month: shortMonth(d.month),
    Income: Math.round(d.income),
    Spent:  Math.round(d.expenses),
  }));

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Pie chart */}
      <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
        <p className="text-sm font-medium text-neutral-400 mb-3">Spending by Category</p>
        {pieData.length === 0 ? (
          <div className="flex items-center justify-center h-[160px] text-neutral-600 text-sm">
            No expense data this month
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={44}
                  strokeWidth={0}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {pieData.map((entry, i) => (
                <div key={entry.category} className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  {entry.category}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bar chart */}
      <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
        <p className="text-sm font-medium text-neutral-400 mb-3">6-Month Trend</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={barData} barGap={2} barCategoryGap="30%">
            <XAxis
              dataKey="month"
              tick={{ fill: '#737373', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Spent"  fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
