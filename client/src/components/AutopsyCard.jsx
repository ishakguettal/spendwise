const CIRCUMFERENCE = 2 * Math.PI * 40; // r=40

function ScoreRing({ score }) {
  const filled = (score / 100) * CIRCUMFERENCE;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#f87171';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        {/* Track */}
        <circle cx="50" cy="50" r="40" fill="none" stroke="#262626" strokeWidth="8" />
        {/* Progress */}
        <circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="-mt-[68px] flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">/ 100</span>
      </div>
      <div className="mt-[40px]" />
    </div>
  );
}

function CategoryBar({ category, amount, max }) {
  const pct = max > 0 ? (amount / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-400 w-24 shrink-0 truncate">{category}</span>
      <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral-400 tabular-nums w-20 text-right shrink-0">
        AED {Math.round(amount).toLocaleString()}
      </span>
    </div>
  );
}

export default function AutopsyCard({ autopsy }) {
  const { summary, health_score, top_categories, anomalies, wasteful } = autopsy;
  const maxAmount = top_categories.length > 0
    ? Math.max(...top_categories.map(c => c.amount))
    : 0;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-100">Statement Autopsy</h2>
        <span className="text-xs text-neutral-600 uppercase tracking-wide">AI Analysis</span>
      </div>

      {/* Score + Summary */}
      <div className="flex items-start gap-6">
        <ScoreRing score={health_score} />
        <div className="flex-1 space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Financial Health</p>
          <p className="text-sm text-neutral-300 leading-relaxed">{summary}</p>
        </div>
      </div>

      {/* Top Categories */}
      {top_categories.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Top Spending Categories</p>
          <div className="space-y-2.5">
            {top_categories.map((c) => (
              <CategoryBar key={c.category} category={c.category} amount={c.amount} max={maxAmount} />
            ))}
          </div>
        </div>
      )}

      {/* Anomalies + Wasteful — side by side if both present */}
      {(anomalies.length > 0 || wasteful.length > 0) && (
        <div className={`grid gap-4 ${anomalies.length > 0 && wasteful.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {anomalies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Anomalies</p>
              <ul className="space-y-1.5">
                {anomalies.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {wasteful.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Potentially Wasteful</p>
              <ul className="space-y-1.5">
                {wasteful.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
