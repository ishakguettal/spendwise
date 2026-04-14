import { useApp } from './context/AppContext';
import { api } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import StatsCards from './components/StatsCards';
import ChartsSection from './components/ChartsSection';
import InsightsSection from './components/InsightsSection';
import SavingsGoalsSection from './components/SavingsGoalsSection';
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
      <div className="pl-[200px]">
        <TopBar />
        {noData ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
            <EmptyState />
          </div>
        ) : (
          <main className="max-w-[1700px] mx-auto px-8 py-8 space-y-8">
            <section id="stats" className="scroll-mt-20">
              <div className="mb-3">
                <h2 className="text-2xl font-semibold text-neutral-100">Overview</h2>
              </div>
              <StatsCards />
            </section>

            <section id="charts" className="border-t border-neutral-800/60 pt-6 scroll-mt-20">
              <div className="mb-3">
                <h2 className="text-2xl font-semibold text-neutral-100">Spending Breakdown</h2>
              </div>
              <ChartsSection />
            </section>

            <section id="insights" className="border-t border-neutral-800/60 pt-6 scroll-mt-20">
              <InsightsSection />
            </section>

            <section id="savings-goals" className="border-t border-neutral-800/60 pt-6 scroll-mt-20">
              <SavingsGoalsSection />
            </section>

            <section id="transactions" className="border-t border-neutral-800/60 pt-6 scroll-mt-20">
              <TransactionsSection />
            </section>
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
