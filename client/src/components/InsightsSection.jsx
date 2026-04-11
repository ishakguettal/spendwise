import { useApp } from '../context/AppContext';
import AutopsyCard from './AutopsyCard';

export default function InsightsSection() {
  const { autopsy, openUploadModal } = useApp();

  if (!autopsy) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-6 py-12 flex flex-col items-center justify-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
          <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
          </svg>
        </div>
        <p className="text-sm text-neutral-400">No statement uploaded yet</p>
        <p className="text-xs text-neutral-600 max-w-xs">
          Upload a bank statement to get an AI-powered breakdown of your spending patterns and financial health.
        </p>
        <button
          onClick={openUploadModal}
          className="mt-2 px-4 py-1.5 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
        >
          Upload Statement
        </button>
      </div>
    );
  }

  return <AutopsyCard autopsy={autopsy} />;
}
