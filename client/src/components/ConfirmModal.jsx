import { useEffect } from 'react';

export default function ConfirmModal({ open, onClose, onConfirm, title, message }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h2 className="text-base font-medium text-neutral-100 mb-2">{title}</h2>
        <p className="text-sm text-neutral-400 mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 transition-colors duration-150"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
