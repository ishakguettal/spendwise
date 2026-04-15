import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db/database.js'; // runs schema creation on import
import { initRates } from './lib/exchangeRates.js';
import transactionsRouter from './routes/transactions.js';
import summaryRouter from './routes/summary.js';
import statementsRouter from './routes/statements.js';
import insightsRouter from './routes/insights.js';
import goalsRouter   from './routes/goals.js';
import savingsRouter from './routes/savings.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/transactions', transactionsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/statements', statementsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/goals',   goalsRouter);
app.use('/api/savings', savingsRouter);
app.use('/api/settings', settingsRouter);

app.listen(PORT, () => {
  console.log(`Spendwise server running on http://localhost:${PORT}`);
  // Warm exchange-rate cache in the background — never blocks startup
  initRates().catch(err => console.warn('[boot] initRates failed:', err.message));
});
