import { Router } from 'express';
import db from '../db/database.js';
import { getRate } from '../lib/exchangeRates.js';

const router = Router();

export const VALID_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP'];

// GET /api/settings
router.get('/', async (_req, res) => {
  const row = db.prepare('SELECT display_currency FROM user_settings WHERE id = 1').get();
  const displayCurrency = row?.display_currency ?? 'AED';
  // Include current AED→displayCurrency rate so the frontend can convert tx amounts
  const rate = await getRate('AED', displayCurrency);
  res.json({ display_currency: displayCurrency, aed_to_display_rate: rate });
});

// PUT /api/settings
router.put('/', async (req, res) => {
  const { display_currency } = req.body;
  if (!VALID_CURRENCIES.includes(display_currency))
    return res.status(400).json({ error: `display_currency must be one of: ${VALID_CURRENCIES.join(', ')}` });

  db.prepare('UPDATE user_settings SET display_currency = ? WHERE id = 1').run(display_currency);

  const rate = await getRate('AED', display_currency);
  res.json({ display_currency, aed_to_display_rate: rate });
});

export default router;
