---
name: Spendwise spec clarifications
description: 7 authoritative clarifications to Spendwise_Plan.md — savings semantics, sign convention, PDF fallback, planner behavior, goal deletion, cache invalidation, no pagination
type: project
---

These override/supplement Spendwise_Plan.md wherever ambiguous:

1. **Savings transactions are manual-only.** PDF parser never outputs type='savings' — only 'income' or 'expense'. Savings = money user consciously set aside, its own bucket.

2. **Sign convention:** All amounts stored positive. net = SUM(income) − SUM(expense). Savings is NEUTRAL — not in net formula, not in Stats cards. summary endpoint returns savings_added separately for the Savings section.

3. **PDF fallback:** If pdf-parse returns empty/garbage (<50 chars) or Prompt 1 fails twice → HTTP 422 `{error, fallback:'paste_text'}`. Frontend shows textarea modal for manual paste, hits same endpoint with `{text: string}` body instead of file. Both paths implemented.

4. **Reverse-Planner with <3 months:** Still call planner with available data + `insufficient_history: true` flag. LLM told to lower confidence and add a note. Never block the feature.

5. **Goal deletion cascades freely.** No blocking. Freed allocations return to unallocated pool automatically. Frontend shows confirmation: "Deleting this goal will return X AED to your unallocated savings pool. Continue?"

6. **Insights cache invalidation:** Invalidate cache row for a month on ANY transaction insert/update/delete with a date in that month. Implement as helper called from POST/PUT/DELETE /api/transactions and statement upload. 24h TTL is secondary safety net only.

7. **No pagination.** GET /api/transactions returns all matching rows ordered by date DESC.

**Why:** These are Ishak's authoritative answers to ambiguities found during spec review.
**How to apply:** Treat these as part of the spec. Reference during implementation of each build step.
