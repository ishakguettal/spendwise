export default function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800/50 min-w-[220px]"
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            {t.message}
          </div>
        </div>
      ))}
    </div>
  );
}
