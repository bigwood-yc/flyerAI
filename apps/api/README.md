# Flyer Retrieval Service (apps/api)

Retrieves current **grocery** flyers from Flipp for a Canadian postal code,
filters them to a curated list of grocery stores, and caches the results in
SQLite. This is the implementation of **Task 3.2** (and folds in the 24h cache
from Task 3.3, since the two are inseparable for a usable service).

Standard library only — **no runtime dependencies**. `pytest` is the only
dependency, and only for running the tests.

## Run it

```bash
cd apps/api

# List the grocery flyers available for a postal code
python -m flipp.cli L3R0B1

# Show the priced items in one store's flyer
python -m flipp.cli L3R0B1 --store "Real Canadian Superstore"
```

The first call hits Flipp; calls within 24 hours are served from the local
cache file (`flipp_cache.db`).

## Chinese product names & categories / 中文商品名与品类

When the `ANTHROPIC_API_KEY` environment variable is set, the `--store` view
shows each item with a category emoji, a Simplified Chinese name, and the
original English name for reference, and it filters out non-grocery items
(health & beauty, household, etc.):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python -m flipp.cli L3R0B1 --store "Real Canadian Superstore"
#   🥬 蔬果  散装菠菜（BUNCHED SPINACH）  $2.5
#   🦐 海鲜  PC 熟白虾 400克（PC® WHITE COOKED SHRIMP, 400G）  $9.99
#   （已过滤 1 个非杂货商品 / filtered 1 non-grocery items）
```

A language model does the categorize + translate in one pass. Each unique
product name is processed once and cached forever, so the running cost is a few
cents. Without the key the view falls back to the plain English list. The model
defaults to `claude-haiku-4-5-20251001`; override with `FLIPP_TRANSLATE_MODEL`.

## Run the tests

```bash
cd apps/api
pip install pytest
python -m pytest tests/ -v
```

The tests are fully offline — the network client is replaced by a fake — so
they pass without reaching Flipp.

## How it works

- `flipp/client.py` — HTTP calls to Flipp's `flyers-ng` endpoints. Sends a
  realistic User-Agent, retries transient failures with exponential backoff,
  and validates the response shape.
- `flipp/stores.py` — the curated grocery merchant allow-list. Flipp's own
  "Groceries" tag is noisy (it includes Costco, Bulk Barn, even Subway), so we
  match merchants against an explicit list instead. Add a store = add a string.
- `flipp/cache.py` — a SQLite file with a 24-hour TTL and staleness detection.
- `flipp/service.py` — the orchestration: read fresh cache without a network
  call; refresh on a miss or stale entry; if a refresh fails but a cache entry
  exists, serve it flagged `stale=True` rather than failing.
- `flipp/enrich.py` — Phase 4 enrichment: a language model categorizes each item
  and translates its name to Simplified Chinese in one batched, cached pass, and
  flags non-grocery items for filtering. Category emoji and labels are mapped
  locally so they stay consistent. The Anthropic client is a thin urllib wrapper
  (no extra dependency) and reads the key from `ANTHROPIC_API_KEY`.

## Known limits

- Flipp's API is **undocumented and unofficial**. It has no SLA and may change
  without notice. The shape validation and the daily cache exist to contain
  that risk. See `/docs/flipp-research.md`.
- For a non-commercial, family-and-friends tool the practical risk is low, but
  this must not be used commercially without revisiting Flipp's terms.
- Coverage varies by postal code. Some areas return fewer grocery flyers.
- This service only retrieves and lightly structures data. Name normalization
  and category assignment are Phase 4.
