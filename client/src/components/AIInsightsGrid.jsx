import { useApp } from '../context/AppContext';

// Trend arrow icons
function ArrowUp({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  );
}

function ArrowDown({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
    </svg>
  );
}

function ArrowFlat({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

// Spending up = bad (red), spending down = good (emerald), flat = neutral
const TREND_CONFIG = {
  up:   { Icon: ArrowUp,   color: 'text-red-400',     bg: 'bg-red-400/10' },
  down: { Icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  flat: { Icon: ArrowFlat, color: 'text-neutral-400', bg: 'bg-neutral-800' },
};

function ObservationCard({ title, detail, trend }) {
  const { Icon, color, bg } = TREND_CONFIG[trend] ?? TREND_CONFIG.flat;
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 flex flex-col gap-3">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-neutral-100 leading-snug">{title}</p>
        <p className="text-sm text-neutral-400 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 flex flex-col gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-neutral-800" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded bg-neutral-800" />
        <div className="h-3 w-full rounded bg-neutral-800" />
        <div className="h-3 w-5/6 rounded bg-neutral-800" />
      </div>
    </div>
  );
}

export default function AIInsightsGrid() {
  const { insights, insightsLoading } = useApp();

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-100">AI Insights</h3>
        <span className="text-xs text-neutral-600 uppercase tracking-wide">Monthly Analysis</span>
      </div>

      {/* Loading */}
      {insightsLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty */}
      {!insightsLoading && (!insights || insights.observations.length === 0) && (
        <p className="text-sm text-neutral-500">
          No insights yet — add a few transactions and check back.
        </p>
      )}

      {/* Cards */}
      {!insightsLoading && insights && insights.observations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.observations.map((obs, i) => (
            <ObservationCard key={i} {...obs} />
          ))}
        </div>
      )}
    </div>
  );
}
