import { useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import StatsCards from './components/StatsCards';
import ChartsSection from './components/ChartsSection';
import TransactionsSection from './components/TransactionsSection';
import EmptyState from './components/EmptyState';

export default function App() {
  const { transactions, loading } = useApp();
  const noData = !loading && transactions.length === 0;

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
            <section id="stats">
              <StatsCards />
            </section>
            <section id="charts">
              <ChartsSection />
            </section>
            <section id="transactions">
              <TransactionsSection />
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
