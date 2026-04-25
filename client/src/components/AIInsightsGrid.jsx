import { useApp } from '../context/AppContext';

function ArrowUp({ cls }) {
  return (
    <svg className={`w-4 h-4 shrink-0 ${cls}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  );
}

function ArrowDown({ cls }) {
  return (
    <svg className={`w-4 h-4 shrink-0 ${cls}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
    </svg>
  );
}

// sentiment drives border color; trend drives arrow direction
// Note: must use border-l-[color] (border-left-color) not border-[color] (border-color shorthand)
// so the left color isn't clobbered by the all-sides border-neutral-700/80 class.
const SENTIMENT = {
  positive: { borderCls: 'border-l-2 border-l-emerald-500', iconCls: 'text-emerald-400' },
  negative: { borderCls: 'border-l-2 border-l-red-400',     iconCls: 'text-red-400' },
  neutral:  { borderCls: 'border-l-2 border-l-neutral-700', iconCls: '' },
};

function ObservationCard({ title, detail, trend, sentiment }) {
  const { borderCls, iconCls } = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const showArrow = sentiment !== 'neutral' && trend !== 'flat';
  const Icon = trend === 'up' ? ArrowUp : ArrowDown;
  return (
    <div className={`rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)] ${borderCls}`}>
      <div className="flex items-start gap-2 mb-1.5">
        {showArrow && <Icon cls={`mt-0.5 ${iconCls}`} />}
        <p className="text-base font-medium text-neutral-100 leading-snug">{title}</p>
      </div>
      <p className="text-sm text-neutral-400 leading-relaxed">{detail}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 border-l-2 border-l-neutral-700 p-4 animate-pulse shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
      <div className="flex items-start gap-2 mb-2">
        <div className="w-4 h-4 rounded bg-neutral-800 shrink-0 mt-0.5" />
        <div className="h-4 w-3/4 rounded bg-neutral-800" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-neutral-800" />
        <div className="h-3 w-5/6 rounded bg-neutral-800" />
      </div>
    </div>
  );
}

export default function AIInsightsGrid() {
  const { insights, insightsLoading, autopsyLoading } = useApp();

  if (insightsLoading || autopsyLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!insights || insights.observations.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No insights yet — add a few transactions and check back.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {insights.observations.map((obs, i) => (
        <ObservationCard key={i} {...obs} />
      ))}
    </div>
  );
}
