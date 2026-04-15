import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';

export default function StatementUploadModal({ open, onClose }) {
  const { refetch, addToast, setAutopsy } = useApp();

  const [mode, setMode]             = useState('file');   // 'file' | 'paste'
  const [dragOver, setDragOver]     = useState(false);
  const [pasteText, setPasteText]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const fileInputRef                = useRef(null);

  // Reset state each time modal opens
  useEffect(() => {
    if (!open) return;
    setMode('file');
    setDragOver(false);
    setPasteText('');
    setLoading(false);
    setError('');
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, loading, onClose]);

  if (!open) return null;

  async function processFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadStatement(file);
      if (result.autopsy) setAutopsy(result.autopsy);
      await refetch();
      const count = result.transactions?.length ?? 0;
      addToast(`Imported ${count} transaction${count !== 1 ? 's' : ''}${result.cached ? ' (cached)' : ''}`);
      onClose();
    } catch (err) {
      setLoading(false);
      if (err.fallback === 'paste_text') {
        setMode('paste');
        setError(err.message);
      } else {
        setError(err.message);
      }
    }
  }

  async function processPaste() {
    if (!pasteText.trim()) { setError('Paste some text first.'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await api.uploadStatementText(pasteText);
      if (result.autopsy) setAutopsy(result.autopsy);
      await refetch();
      const count = result.transactions?.length ?? 0;
      addToast(`Imported ${count} transaction${count !== 1 ? 's' : ''}${result.cached ? ' (cached)' : ''}`);
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  }

  // ── Drag & drop handlers ─────────────────────────────────────────────────
  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave()  { setDragOver(false); }
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    processFile(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium">Upload Statement</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-neutral-500 hover:text-neutral-100 disabled:opacity-40 transition-colors duration-150 p-1 rounded-lg hover:bg-neutral-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
            {['file', 'paste'].map((m) => (
              <button
                key={m}
                type="button"
                disabled={loading}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-1.5 text-sm rounded-md capitalize transition-colors duration-150 ${
                  mode === m
                    ? 'bg-emerald-500 text-neutral-950 font-medium'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                }`}
              >
                {m === 'file' ? 'Upload PDF' : 'Paste Text'}
              </button>
            ))}
          </div>

          {/* Currency hint */}
          <p className="text-xs text-neutral-600">
            Currency will be auto-detected from your statement. Amounts are stored in AED and converted to your display currency.
          </p>

          {/* File upload zone */}
          {mode === 'file' && (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => !loading && fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer h-44 transition-colors duration-150 ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-500/5'
                  : 'border-neutral-700 hover:border-neutral-600 bg-neutral-950/40'
              } ${loading ? 'pointer-events-none opacity-50' : ''}`}
            >
              <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <div className="text-center">
                <p className="text-sm text-neutral-300">Drop a PDF here, or click to browse</p>
                <p className="text-xs text-neutral-600 mt-1">Max 10 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => processFile(e.target.files[0])}
              />
            </div>
          )}

          {/* Paste textarea */}
          {mode === 'paste' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                Copy your bank statement text and paste it below.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                disabled={loading}
                rows={8}
                placeholder="Paste statement text here…"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none resize-none transition-colors duration-150"
              />
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        {mode === 'paste' && (
          <div className="flex items-center justify-end gap-3 px-6 pb-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={processPaste}
              disabled={loading || !pasteText.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {loading ? 'Processing…' : 'Analyse Statement'}
            </button>
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/80 rounded-2xl">
            <svg className="animate-spin w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-neutral-400">Analysing your statement…</p>
          </div>
        )}
      </div>
    </div>
  );
}
