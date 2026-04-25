import { useApp } from '../context/AppContext';
import AutopsyCard from './AutopsyCard';
import AIInsightsGrid from './AIInsightsGrid';

function AutopsyEmpty({ onUpload }) {
  return (
    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 px-4 py-3 flex items-center justify-between gap-4 shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
      <p className="text-sm text-neutral-500">No statement uploaded — upload one to get an AI spending breakdown.</p>
      <button
        onClick={onUpload}
        className="shrink-0 px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
      >
        Upload
      </button>
    </div>
  );
}

function formatUpdated() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AutopsySkeleton() {
  return (
    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-5 animate-pulse shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.04)]">
      <div className="flex gap-5">
        <div className="w-[100px] h-[100px] rounded-full bg-neutral-800 shrink-0" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="h-3 w-1/3 rounded bg-neutral-800" />
          <div className="h-3 w-full rounded bg-neutral-800" />
          <div className="h-3 w-4/5 rounded bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}

export default function InsightsSection() {
  const { autopsy, autopsyLoading, openUploadModal } = useApp();
  const loading = autopsyLoading;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-100">AI Monthly Insights</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Pattern detection across your last 3 months</p>
        </div>
        <span className="text-xs text-neutral-600 mt-1.5">Updated {formatUpdated()}</span>
      </div>

      {/* Statement Autopsy */}
      {loading ? (
        <AutopsySkeleton />
      ) : autopsy ? (
        <AutopsyCard autopsy={autopsy} />
      ) : (
        <AutopsyEmpty onUpload={openUploadModal} />
      )}

      {/* AI Insights grid — passes autopsyLoading so both sections finish together */}
      <AIInsightsGrid />
    </div>
  );
}
