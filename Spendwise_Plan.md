# Spendwise — Implementation Brief

## Context
Built by Ishak, a 2nd-year BSc AI & CS student at University of Birmingham Dubai, as his first portfolio project. This document is the single source of truth — implement exactly what is specified, nothing more. No scope creep.

## Product
**Spendwise** — single-page, single-user personal finance dashboard. User uploads a PDF bank statement, the app parses and auto-categorizes every transaction into SQLite, populates the dashboard, generates an AI "Statement Autopsy" report, manages multiple savings goals in parallel, and allocates savings across those goals with an AI multi-goal cut planner. No auth, no signup, no multi-user, no multi-currency.

## Tech stack (fixed)
- Frontend: React + Vite + TailwindCSS + Recharts
- Backend: Node.js + Express + `better-sqlite3` + `multer` + `pdf-parse`
- LLM: Google Gemini `gemini-1.5-flash` via `@google/generative-ai`, free tier
- Deploy: Vercel (frontend), Render free tier (backend + SQLite on persistent disk)

## Repo layout
```
/client        Vite React app
/server        Express API
/server/db     SQLite file (gitignored)
/server/prompts LLM prompt templates
.env.example
README.md
```

## Data model (create on boot if missing)

**transactions**: id PK, type CHECK('income','expense','savings'), category TEXT, amount REAL (positive; type sets sign), date TEXT ISO YYYY-MM-DD, description TEXT, source CHECK('manual','statement') DEFAULT 'manual', statement_id FK NULL, created_at.

**goals**: id PK, name, target_amount REAL, deadline ISO, priority CHECK('high','medium','low'), status CHECK('active','completed','archived') DEFAULT 'active', created_at.

**allocations**: id PK, goal_id FK ON DELETE CASCADE, amount REAL (positive = into goal, negative = back to pool), note, created_at.

**statements**: id PK, filename, hash TEXT UNIQUE (sha256 of bytes), autopsy_json TEXT, uploaded_at.

**insights_cache**: id PK, month TEXT UNIQUE (YYYY-MM), content_json TEXT, generated_at.

### Derived (never stored)
- `total_savings_balance` = SUM(amount WHERE type='savings')
- `allocated_to_goal(X)` = SUM(allocations.amount WHERE goal_id=X)
- `total_allocated` = SUM(allocations.amount)
- `unallocated_pool` = total_savings_balance − total_allocated
- **Invariant: total_allocated ≤ total_savings_balance.** Enforce at API layer before every allocation insert — reject with 400 otherwise.

## Fixed category list
Food, Groceries, Transport, Rent, Bills, Subscriptions, Entertainment, Shopping, Health, Education, Travel, Income, Savings, Other. LLM must pick from this exact list — validate and default to "Other" on mismatch.

## API endpoints

**Transactions**: `GET /api/transactions?month=&type=&category=`, `POST /api/transactions` (if category omitted call LLM prompt 0 to categorize from description before insert), `PUT /api/transactions/:id`, `DELETE /api/transactions/:id`.

**Summary**: `GET /api/summary?month=YYYY-MM` → `{income, expenses, net, savings_added, by_category:[{category,total}], trend_6mo:[{month,income,expenses}]}`.

**Savings**: `GET /api/savings` → `{total_balance, total_allocated, unallocated, per_goal:[{goal_id,goal_name,allocated,target,progress_pct}]}`. `POST /api/savings/allocate` body `{goal_id, amount}` — enforce invariant. `POST /api/savings/reallocate` body `{from_goal_id, to_goal_id, amount}` — atomic, both inserts in a transaction.

**Goals**: `GET /api/goals`, `POST /api/goals` body `{name, target_amount, deadline, priority}`, `PUT /api/goals/:id`, `DELETE /api/goals/:id` (cascades allocations), `POST /api/goals/plan` → LLM prompt 3 output.

**Statements**: `POST /api/statements/upload` multipart. Flow: hash file → if hash exists return cached autopsy + existing statement transactions → else `pdf-parse` → LLM prompt 1 → validate JSON schema → insert transactions with source='statement' and statement_id → LLM prompt 2 → cache autopsy_json → return `{transactions, autopsy}`.

**Insights**: `GET /api/insights?month=YYYY-MM` — return cache if fresh (<24h) else LLM prompt 4 and cache.

## LLM prompts (all use gemini-1.5-flash, temperature 0.3, responseMimeType 'application/json' where supported, try/catch, schema-validate before use, one retry on JSON parse failure with corrective prompt, fallback gracefully on second failure)

**Prompt 0 — categorize single transaction**: input description + amount + type. Output `{category: one of fixed list}`.

**Prompt 1 — PDF text → transactions**: input raw PDF text. Output `{transactions:[{date:'YYYY-MM-DD', description, amount:number positive, type:'income'|'expense', category:fixed_list}]}`. System msg: "You are a strict JSON extractor. Return ONLY valid JSON. No prose, no markdown."

**Prompt 2 — Statement Autopsy**: input parsed transactions + totals. Output `{summary:string (2-3 sentences), top_categories:[{category,amount,pct}], anomalies:[string], wasteful_flags:[string], health_score:number 0-100}`.

**Prompt 3 — Multi-goal Reverse-Planner**: input last 3 months grouped by category + all active goals (name, target, deadline, priority, current allocated) + unallocated pool + monthly net average. Output `{monthly_savings_target:number, per_goal_plan:[{goal_id, monthly_contribution, feasibility:'easy'|'moderate'|'aggressive'|'infeasible', suggested_new_deadline:null|ISO, reasoning}], category_cuts:[{category,current_avg,target_avg,reduction,reason}], overall_feasible:boolean, notes}`. Rules: fund high priority first; if required monthly contributions exceed monthly_net × 0.6 mark overall_feasible=false and per-goal suggested_new_deadline.

**Prompt 4 — Monthly insights**: input current month + previous 2 months transactions. Output `{observations:[{title, detail, trend:'up'|'down'|'flat'}]}` with 3–5 items. Must cite specific numbers and categories, compare to prior months when relevant.

## Frontend — single page

**Global state**: React Context holding `selectedMonth, transactions, goals, savings, insights, autopsy`. Refetch affected resources after every mutation — no optimistic updates.

**Layout** (one scrollable page, no router):
- **Left sidebar** fixed 60px icon rail: Dashboard / Transactions / Insights / Goals / Savings. Clicks call `scrollIntoView` on section id.
- **Top bar** sticky: "Spendwise" wordmark, month dropdown (last 12 months), "Upload statement" button, "+ Add" button.
- **§ Stats**: 3 cards Income / Spent / Net. Net green if ≥0, red if <0.
- **§ Charts**: Recharts PieChart by category (current month) left, BarChart 6-month trend right.
- **§ Insights**: Autopsy card at top (if any statement uploaded) then 3–5 observation cards.
- **§ Savings**: three stat cards Total Saved / Allocated / Unallocated. Horizontal stacked bar visualizing allocation split by goal. "Allocate" button opens slider modal.
- **§ Goals**: summary strip "N active • X/month needed • On track A • Behind B". Stacked expandable goal cards. Collapsed: name, progress bar (allocated/target), days left, status tag. Expanded: cut-plan cards from prompt 3, "Allocate to this goal", edit, delete. "+ New goal" button top of section. "Recalculate plan" bottom of section calls `/api/goals/plan`.
- **§ Transactions**: full filterable/sortable table. Columns: date, description, category, type, amount, source, actions. Filters above: category dropdown, type dropdown, search. Inline edit/delete.

**Modals**: Add/Edit transaction, Upload statement (dropzone + loading + success summary), New/Edit goal, Allocate savings (sliders per goal, live-update remaining, block submit if pool would go negative).

**Empty state**: zero transactions → centered card "Upload your first statement or add a transaction" + two buttons.

**Styling**: TailwindCSS dark mode. `bg-neutral-950 text-neutral-100`, emerald-500 accent, `rounded-2xl`, `border border-neutral-800`, `p-6`, no gradients, no shadows beyond `ring-1 ring-neutral-800`. Sans font. Linear/Notion aesthetic.

## Critical rules
- Validate all LLM JSON against expected schema before use; never trust raw output.
- Savings invariant enforced at API layer, not just UI.
- Cache autopsy by statement hash; cache insights by month with 24h TTL.
- Monetary values stored as REAL, displayed rounded to integers.
- Dates stored/transmitted as ISO YYYY-MM-DD.
- CORS: allow Vercel frontend origin from env var.
- Env vars: `GEMINI_API_KEY`, `PORT`, `CLIENT_ORIGIN`.
- Reallocations must run inside a single DB transaction.

## Build order
1. Express skeleton + SQLite schema + transactions CRUD + summary. Test in Postman.
2. React skeleton + layout + sidebar + top bar + stats + charts + transactions table wired to backend.
3. Add/edit transaction modal + inline delete.
4. Gemini client + prompt 0 categorization on POST /transactions when category missing.
5. PDF upload + pdf-parse + prompt 1 + insert + prompt 2 + autopsy card.
6. Insights endpoint + prompt 4 + insights cards.
7. Goals CRUD + goals section UI + new/edit goal modal.
8. Savings endpoints + savings section + allocate modal + invariant enforcement.
9. Prompt 3 + `/api/goals/plan` + cut-plan cards in expanded goal cards + Recalculate button.
10. Empty states, loading states, error toasts.
11. Deploy Render + Vercel, set env vars, verify end-to-end live.
