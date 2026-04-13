import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AppContext = createContext(null);

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function AppProvider({ children }) {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [transactions,  setTransactions]  = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [loading,       setLoading]       = useState(true);

  // ── Autopsy state (session-only) ──────────────────────────────────────────
  const [autopsy, setAutopsy] = useState(null);

  // ── Global existence flag (true once any tx exists anywhere) ─────────────
  const [hasAnyTransactions, setHasAnyTransactions] = useState(null); // null = not yet loaded

  // ── Goals ─────────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState([]);

  // ── Savings ───────────────────────────────────────────────────────────────
  const [savings, setSavings] = useState(null);

  // ── Insights state ────────────────────────────────────────────────────────
  const [insights,        setInsights]        = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [editTransaction,      setEditTransaction]      = useState(null);
  const [transactionToDelete,  setTransactionToDelete]  = useState(null);
  const [uploadModalOpen,      setUploadModalOpen]      = useState(false);

  // ── Toast state ───────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditTransaction(null);
    setTransactionModalOpen(true);
  }, []);

  const openEditModal = useCallback((tx) => {
    setEditTransaction(tx);
    setTransactionModalOpen(true);
  }, []);

  const closeTransactionModal = useCallback(() => {
    setTransactionModalOpen(false);
    setEditTransaction(null);
  }, []);

  const openDeleteModal  = useCallback((tx) => setTransactionToDelete(tx), []);
  const closeDeleteModal = useCallback(() => setTransactionToDelete(null), []);

  const openUploadModal  = useCallback(() => setUploadModalOpen(true), []);
  const closeUploadModal = useCallback(() => setUploadModalOpen(false), []);

  // ── Fetching ──────────────────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    try {
      const data = await api.getTransactions({ month: selectedMonth });
      setTransactions(data);
    } catch {
      setTransactions([]);
    }
  }, [selectedMonth]);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.getSummary(selectedMonth);
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [selectedMonth]);

  const fetchGoals = useCallback(async () => {
    try {
      const data = await api.getGoals();
      setGoals(data);
    } catch {
      setGoals([]);
    }
  }, []);

  const fetchSavings = useCallback(async () => {
    try {
      const data = await api.getSavings();
      setSavings(data);
    } catch {
      setSavings(null);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const data = await api.getInsights(selectedMonth);
      setInsights(data);
    } catch {
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchTransactions(),
      fetchSummary(),
      fetchGoals(),
      fetchSavings(),
      api.hasAnyTransactions()
        .then(({ exists }) => setHasAnyTransactions(exists))
        .catch(() => setHasAnyTransactions(false)),
    ]).finally(() => setLoading(false));
  }, [fetchTransactions, fetchSummary, fetchGoals, fetchSavings]);

  // Insights run independently so they don't block the main loading spinner
  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const refetch = useCallback(() => Promise.all([
    fetchTransactions(),
    fetchSummary(),
    fetchGoals(),
    fetchSavings(),
    fetchInsights(),
    api.hasAnyTransactions()
      .then(({ exists }) => setHasAnyTransactions(exists))
      .catch(() => {}),
  ]), [fetchTransactions, fetchSummary, fetchGoals, fetchSavings, fetchInsights]);

  return (
    <AppContext.Provider value={{
      // data
      selectedMonth, setSelectedMonth,
      transactions, summary, loading, refetch,
      // global state
      hasAnyTransactions,
      // goals
      goals, fetchGoals,
      // savings
      savings, fetchSavings,
      // autopsy
      autopsy, setAutopsy,
      // insights
      insights, insightsLoading,
      // modals
      transactionModalOpen, editTransaction, transactionToDelete,
      openAddModal, openEditModal, closeTransactionModal,
      openDeleteModal, closeDeleteModal,
      uploadModalOpen, openUploadModal, closeUploadModal,
      // toasts
      toasts, addToast,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
