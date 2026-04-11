export default function EmptyState() {
  return (
    <div className="rounded-2xl border border-neutral-800 p-12 text-center max-w-sm">
      <p className="text-neutral-300 text-base font-medium mb-2">No transactions yet</p>
      <p className="text-neutral-600 text-sm mb-8">
        Upload your first statement or add a transaction to get started
      </p>
      <div className="flex gap-3 justify-center">
        <button className="px-4 py-2 rounded-xl border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors">
          Upload Statement
        </button>
        <button className="px-4 py-2 rounded-xl bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 transition-colors">
          + Add Transaction
        </button>
      </div>
    </div>
  );
}
