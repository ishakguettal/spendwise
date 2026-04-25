# Spendwise

AI-powered personal finance dashboard. Upload a PDF bank statement → transactions are extracted, sanitized, auto-categorized, and analyzed. No manual entry.

---

## Features

- **PDF statement parsing** — extracts structured transactions from raw bank PDFs via LLM-powered parsing
- **PII sanitization** — regex pipeline strips IBANs, account numbers, card digits, references, emails, and phones before any text hits the AI layer
- **Auto-categorization** — AI classification with UAE-specific merchant mapping (Careem, Noon, ENOC, Tabby, etc.)
- **Statement Autopsy** — health score (0–100), anomaly detection, wasteful spending flags
- **AI insights** — multi-month trend detection with personal baseline comparisons
- **Savings reverse-planner** — multi-goal feasibility scoring with category-level cut suggestions
- **Multi-currency** — AED/USD/EUR/GBP with live exchange rates, dashboard-wide switcher

## Architecture

PDF → pdf-parse → sanitizeStatementText (PII strip) → LLM: parseStatement → LLM: categorize (per-txn) → LLM: autopsy → SQLite → React dashboard

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, TailwindCSS, Recharts |
| Backend | Node.js, Express, better-sqlite3, multer, pdf-parse |
| AI | LLM API (configurable) |
| DB | SQLite — 7 tables (transactions, goals, allocations, statements, insights_cache, exchange_rates, user_settings) |

## Data Privacy

Statement text passes through a sanitization layer before reaching any external API. The sanitizer removes IBANs, full/partial account numbers, card numbers, transfer-context digits, bank references, emails, and phone numbers. Logs redaction counts only — no sensitive data is stored or transmitted.

## Local Setup

```bash
git clone https://github.com/ishakguettal/spendwise.git
cd spendwise
cd server && cp .env.example .env
npm install && npm run dev
cd client
npm install && npm run dev
```

Runs at localhost:5173 (frontend) / localhost:3001 (API). Requires Node 18+.

## Project Structure

```
/client/src/components — Dashboard UI (15+ components)
/client/src/context — Global state (AppContext.jsx)
/client/src/lib — Currency formatting
/client/src/api.js — All backend fetch calls
/server/db — SQLite schema + migrations
/server/routes — REST endpoints (transactions, summary, statements, insights, goals, settings)
/server/prompts — 5 LLM prompt templates (categorize, parseStatement, autopsy, plan, insights)
/server/llm — LLM client config
/server/lib — PII sanitizer, exchange rate cache (12h TTL, stale fallback)
```

Built by Ishak Guettal — BSc AI & Computer Science, University of Birmingham Dubai.
