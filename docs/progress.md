# Progress

Canonical task log. Mirrored in the project document (Grocery Flyer AI Recommender).

## 2026-06-05

### Decisions
- **TDR-001** Scope: Grocery-first, minimum-cost, category-extensible. Accepted.
- **TDR-002** Flipp acquisition: backend-only fetch, daily refresh, 24h cache. Accepted.
- **TDR-003** Cache store: SQLite / flat file (not PostgreSQL) for the MVP. Accepted.
- Backend language for the retrieval service: **Python** (zero runtime deps; aligns with the proven probe and the data-heavy Phase 4 work). Built as a lean standalone service under `apps/api`, deferring the heavy NestJS/Docker monorepo.

### Task 3.1 — Research Flipp Data Access — DONE (live-verified)
- Confirmed the `flyers-ng` endpoints, request format, and data shape.
- Live run for L3R0B1: HTTP 200, 62 grocery flyers, all nine target stores present, 473 priced items from one flyer. PASS.
- Deliverable: `flipp_feasibility_test.py`, research notes in this repo.
- Findings feeding Phase 4: the Groceries tag is noisy (use a curated allow-list); flyers mix non-grocery items (filter in category assignment).

### Task 3.2 — Flyer Retrieval Service — DONE (also delivers Task 3.3 cache)
- `apps/api/flipp/`: client, curated store allow-list, SQLite 24h cache, and a
  cache-first service with retry, shape validation, and graceful degradation.
- CLI: `python -m flipp.cli <POSTAL_CODE> [--store NAME]`.
- 14 unit tests, all offline (network client mocked). All passing.
- Verified the CLI fails gracefully with a clear message when Flipp is unreachable.
- CLI result display is bilingual (Chinese primary, English in parentheses) so non-English-reading users can browse the output. Store and product names are left exactly as Flipp returns them.

## Next
- Wire enrichment into the web/mobile UI when those exist (the service and the
  enrichment are ready; the app layer is future work).

## 2026-06-05 (Phase 4 enrichment — names & categories)

### Decision
- For "understand the product at a glance", chosen approach is an LLM that does
  category + Simplified Chinese name in one cached pass (Option B). A naive
  keyword categorizer was rejected after a demo showed substring misfires
  ("bunched"->bun->bakery, "watermelon"->water->beverage).

### Task 4.2 / 4.3 — Normalize names + assign category — DONE (LLM enrichment)
- `apps/api/flipp/enrich.py`: batched, cached LLM enrichment. For each item it
  returns category (mapped locally to emoji + Chinese label), a Simplified
  Chinese name (brands kept/transliterated), and an is_grocery flag.
- Cost control: each unique product name is translated once and cached forever;
  names are sent in batches. Default model `claude-haiku-4-5-20251001`.
- CLI `--store` now shows: emoji + Chinese category + Chinese name + English
  original + price, and filters out non-grocery items (this lands the Phase 4
  non-grocery filter finding).
- Security: API key read from `ANTHROPIC_API_KEY`; never in code or argv. No key
  or API failure degrades gracefully to the plain English list.
- 7 new unit tests (LLM mocked), 21 total, all passing.
