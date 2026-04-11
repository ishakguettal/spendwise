import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AppContext = createContext(null);

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function AppProvider({ children }) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await api.getTransactions();
      setTransactions(data);
    } catch {
      setTransactions([]);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.getSummary(selectedMonth);
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTransactions(), fetchSummary()]).finally(() =>
      setLoading(false)
    );
  }, [fetchTransactions, fetchSummary]);

  // Call after any mutation to keep state fresh
  const refetch = useCallback(
    () => Promise.all([fetchTransactions(), fetchSummary()]),
    [fetchTransactions, fetchSummary]
  );

  return (
    <AppContext.Provider
      value={{ selectedMonth, setSelectedMonth, transactions, summary, loading, refetch }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
