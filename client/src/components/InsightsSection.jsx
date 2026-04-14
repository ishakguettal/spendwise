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

export default function InsightsSection() {
  const { autopsy, openUploadModal } = useApp();

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
      {autopsy ? (
        <AutopsyCard autopsy={autopsy} />
      ) : (
        <AutopsyEmpty onUpload={openUploadModal} />
      )}

      {/* AI Insights grid */}
      <AIInsightsGrid />
    </div>
  );
}
