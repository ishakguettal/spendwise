import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, CartesianGrid,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../lib/formatCurrency';

const PIE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6',
];

function shortMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function PieTooltip({ active, payload, displayCurrency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm">
      <p className="text-neutral-300 font-medium">{payload[0].name}</p>
      <p className="text-neutral-100">{formatCurrency(payload[0].value, displayCurrency)}</p>
    </div>
  );
}

function LineTooltip({ active, payload, label, displayCurrency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-950/95 border border-neutral-700/60 rounded-xl px-3 py-2.5 text-sm space-y-1.5 shadow-xl backdrop-blur-sm">
      <p className="text-neutral-500 text-xs font-medium tracking-wide uppercase">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.stroke }} />
          <span className="text-neutral-400">{p.dataKey}</span>
          <span className="text-neutral-100 font-medium ml-auto pl-3">{formatCurrency(p.value, displayCurrency)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChartsSection() {
  const { summary, displayCurrency } = useApp();

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
                <Tooltip content={<PieTooltip displayCurrency={displayCurrency} />} />
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

      {/* Line chart */}
      <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
        <p className="text-sm font-medium text-neutral-400 mb-3">6-Month Trend</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={barData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <defs>
              {/* Gradient fills */}
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradSpent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              {/* Glow filters */}
              <filter id="glowGreen" x="-20%" y="-50%" width="140%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glowRed" x="-20%" y="-50%" width="140%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: '#737373', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<LineTooltip displayCurrency={displayCurrency} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="Income"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradIncome)"
              dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#10b981', stroke: 'rgba(16,185,129,0.3)', strokeWidth: 4 }}
              filter="url(#glowGreen)"
            />
            <Area
              type="monotone"
              dataKey="Spent"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#gradSpent)"
              dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#ef4444', stroke: 'rgba(239,68,68,0.3)', strokeWidth: 4 }}
              filter="url(#glowRed)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
