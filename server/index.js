import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db/database.js'; // runs schema creation on import
import transactionsRouter from './routes/transactions.js';
import summaryRouter from './routes/summary.js';
import statementsRouter from './routes/statements.js';

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/transactions', transactionsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/statements', statementsRouter);

app.listen(PORT, () => {
  console.log(`Spendwise server running on http://localhost:${PORT}`);
});
