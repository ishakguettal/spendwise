import { useApp } from './context/AppContext';
import { api } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import StatsCards from './components/StatsCards';
import ChartsSection from './components/ChartsSection';
import InsightsSection from './components/InsightsSection';
import SavingsSection from './components/SavingsSection';
import GoalsSection from './components/GoalsSection';
import TransactionsSection from './components/TransactionsSection';
import EmptyState from './components/EmptyState';
import TransactionModal from './components/TransactionModal';
import StatementUploadModal from './components/StatementUploadModal';
import ConfirmModal from './components/ConfirmModal';
import ToastContainer from './components/ToastContainer';

export default function App() {
  const {
    hasAnyTransactions, loading,
    transactionModalOpen, editTransaction, closeTransactionModal,
    transactionToDelete, closeDeleteModal,
    uploadModalOpen, closeUploadModal,
    refetch, addToast, toasts,
  } = useApp();

  // Only show the full-page empty state on the very first load when the entire
  // database has zero transactions. Per-month empty states are handled inline.
  const noData = !loading && hasAnyTransactions === false;

  async function handleDelete() {
    try {
      await api.deleteTransaction(transactionToDelete.id);
      closeDeleteModal();
      await refetch();
      addToast('Transaction deleted');
    } catch (err) {
      addToast(`Error: ${err.message}`);
      closeDeleteModal();
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      <Sidebar />
      <div className="pl-[60px]">
        <TopBar />
        {noData ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
            <EmptyState />
          </div>
        ) : (
          <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            <section id="stats"><StatsCards /></section>
            <section id="charts"><ChartsSection /></section>
            <section id="insights"><InsightsSection /></section>
            <section id="savings"><SavingsSection /></section>
            <section id="goals"><GoalsSection /></section>
            <section id="transactions"><TransactionsSection /></section>
          </main>
        )}
      </div>

      <TransactionModal
        open={transactionModalOpen}
        transaction={editTransaction}
        onClose={closeTransactionModal}
      />
      <StatementUploadModal
        open={uploadModalOpen}
        onClose={closeUploadModal}
      />
      <ConfirmModal
        open={transactionToDelete !== null}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        title="Delete transaction"
        message="This action cannot be undone."
      />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
