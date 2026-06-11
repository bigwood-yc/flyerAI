# Flyer UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three UX features across both Web (Next.js 15) and Mobile (Expo 51): (1) flyer detail groups items by category sorted by price, (2) store list lets users filter which stores feed into recommendations, (3) stores are sorted by distance from the user's postal code with km labels.

**Architecture:**
- **Distance:** New `geocode.py` uses `pgeocode` (offline FSA centroid) for the user's location and OSM Nominatim for store locations (cached in SQLite with STABLE_TTL). `/api/flyers` returns `distance_km` per store and sorts by it. First-request geocoding runs in a background thread (non-blocking); subsequent requests use the cache.
- **Store filter:** `/api/recommendations` gains an optional `stores` query param (comma-separated merchant names). `recommend.py` normalises + filters the flyer list before building the weekly guide.
- **Category grouping + price sort:** Pure frontend change: group items by `category` key, sort each group by `Number(price)` ascending. No backend changes required.

**Tech Stack:** `pgeocode>=1.0.0` (GeoNames, offline), OSM Nominatim (free, 1 req/s), Python `threading`, React `useState` for checkbox state, Expo Router URL params for cross-tab filter state.

**Key constraints:**
- `pgeocode` + `pandas` + `numpy` are already installed (`pandas==2.3.0`, `numpy==2.3.0`).
- `SqliteCache` is NOT thread-safe (single connection). Background geocoding must open its own connection via a fresh `SqliteCache` instance.
- `store_coords_cached()` distinguishes three states: (a) never cached → returns `None` + triggers background geocoding, (b) cached `None` (geocoding failed) → returns `None`, no re-geocode, (c) cached `(lat, lon)` → returns coords.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/flipp/geocode.py` | **CREATE** | `postal_code_coords`, `haversine_km`, `store_coords_cached`, `kick_geocoding` |
| `apps/api/flipp/service.py` | **MODIFY** | Attach `distance_km` to each flyer in `get_grocery_flyers()` |
| `apps/api/flipp/recommend.py` | **MODIFY** | Accept `store_filter: list[str] \| None` in `generate()` |
| `apps/api/server.py` | **MODIFY** | Add `stores` query param to `/api/recommendations` |
| `apps/api/requirements.txt` | **MODIFY** | Add `pgeocode>=1.0.0` |
| `apps/api/tests/test_geocode.py` | **CREATE** | Unit tests for geocode utilities (no network) |
| `apps/api/tests/test_recommend.py` | **MODIFY** | Add 3 store-filter tests |
| `apps/web/lib/api.ts` | **MODIFY** | Add `distance_km?` to `FlyerInfo`; add `stores?[]` param to `getRecommendations` |
| `apps/web/components/CategoryItemGroup.tsx` | **CREATE** | Renders one category block (header + price-sorted items) |
| `apps/web/app/flyers/[store]/page.tsx` | **MODIFY** | Group items by category, render `CategoryItemGroup` per group |
| `apps/web/components/StoreSelector.tsx` | **CREATE** | Client component: checkbox store grid + filtered recommendations link |
| `apps/web/app/flyers/page.tsx` | **MODIFY** | Pass flyer data to `StoreSelector` (removes direct `StoreCard` usage) |
| `apps/web/app/recommendations/page.tsx` | **MODIFY** | Read `stores` URL param; pass to `getRecommendations` |
| `apps/mobile/lib/api.ts` | **MODIFY** | Add `distance_km?` to `FlyerInfo`; add `stores?[]` param to `getRecommendations` |
| `apps/mobile/components/StoreItem.tsx` | **MODIFY** | Accept `selected`, `distanceKm`, `onToggleSelect`, `onNavigate` props |
| `apps/mobile/app/(tabs)/stores.tsx` | **MODIFY** | Store selection state + "生成推荐" button |
| `apps/mobile/app/(tabs)/recommendations.tsx` | **MODIFY** | Read `stores` URL param; re-fetch when it changes |
| `apps/mobile/app/flyer/[store].tsx` | **MODIFY** | Sort `filteredItems` by price within each category filter |

---

## Task 1: Backend — geocode.py + distance in /api/flyers

**Files:**
- Create: `apps/api/flipp/geocode.py`
- Modify: `apps/api/flipp/service.py`
- Modify: `apps/api/requirements.txt`
- Test: `apps/api/tests/test_geocode.py`

- [ ] **Step 1: Add pgeocode to requirements.txt**

```
# apps/api/requirements.txt  — append at end
pgeocode>=1.0.0
```

Install it:

```bash
cd apps/api
pip install pgeocode>=1.0.0
```

Expected: `Successfully installed pgeocode-1.x.x` (pandas+numpy already present)

- [ ] **Step 2: Write the failing tests first**

Create `apps/api/tests/test_geocode.py`:

```python
"""Geocoding utilities — no network calls (haversine + cache only)."""

import math
import pytest
from flipp.geocode import haversine_km, store_coords_cached, _cache_key


class FakeCache:
    def __init__(self, data=None):
        self.store = data or {}
        self.written = {}

    def get(self, key):
        if key not in self.store:
            return None
        return self.store[key], False   # (value, is_stale=False)

    def set(self, key, value):
        self.written[key] = value


def test_haversine_toronto_montreal():
    # Toronto (43.6532, -79.3832) → Montreal (45.5017, -73.5673) ≈ 503 km
    dist = haversine_km(43.6532, -79.3832, 45.5017, -73.5673)
    assert 480 < dist < 530, f"expected ~503 km, got {dist:.1f}"


def test_haversine_same_point_is_zero():
    assert haversine_km(43.0, -79.0, 43.0, -79.0) == pytest.approx(0.0)


def test_store_coords_cached_miss_returns_none():
    cache = FakeCache()
    result = store_coords_cached("No Frills", "L4C", cache)
    assert result is None


def test_store_coords_cached_hit_returns_coords():
    key = _cache_key("No Frills", "L4C")
    cache = FakeCache({key: (43.87, -79.44)})
    result = store_coords_cached("No Frills", "L4C", cache)
    assert result == (43.87, -79.44)


def test_store_coords_cached_failed_geocoding_returns_none():
    # A previous geocoding attempt failed and stored None
    key = _cache_key("No Frills", "L4C")
    cache = FakeCache({key: None})
    result = store_coords_cached("No Frills", "L4C", cache)
    assert result is None


def test_cache_key_normalises_spaces_and_ampersand():
    k1 = _cache_key("T&T Supermarket", "L4C")
    k2 = _cache_key("t&t supermarket", "l4c")
    assert k1 == k2
    assert "geo:" in k1
    assert "L4C" in k1
```

- [ ] **Step 3: Run the failing tests**

```bash
cd apps/api
python -m pytest tests/test_geocode.py -v
```

Expected: **ImportError** — `flipp.geocode` does not exist yet.

- [ ] **Step 4: Create apps/api/flipp/geocode.py**

```python
"""
Geocoding utilities for distance-sorted store lists.

postal_code_coords(pc):
    Offline FSA centroid via pgeocode (GeoNames dataset). Returns (lat, lon)
    or None. Thread-safe (protected by a module-level lock on first load).

haversine_km(lat1, lon1, lat2, lon2):
    Great-circle distance in km.

store_coords_cached(merchant, fsa, cache):
    Reads (lat, lon) from SqliteCache only. Returns None if not yet geocoded
    OR if a previous geocoding attempt failed. Does NOT make network calls.

kick_geocoding(merchants, postal_code, cache):
    Fires a daemon thread that Nominatim-geocodes uncached merchants
    (1 req/s rate limit). Each result is written to a NEW SqliteCache
    connection opened inside the thread (thread-safe). Merchants already
    in cache (including cached failures) are skipped.

The geo: cache entries use STABLE_TTL (10 years) because store locations
almost never change.
"""

import json
import math
import threading
import time
import urllib.parse
import urllib.request

import pgeocode

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_UA = "GroceryFlyerAI/1.0 (contact: admin@example.com)"
_NOMINATIM_DELAY = 1.1   # seconds between requests (OSM policy: 1/sec)

_nomi_ca = None
_nomi_lock = threading.Lock()


def postal_code_coords(postal_code: str) -> tuple[float, float] | None:
    """Return (lat, lon) for the FSA (first 3 chars), or None on failure."""
    global _nomi_ca
    with _nomi_lock:
        if _nomi_ca is None:
            _nomi_ca = pgeocode.Nominatim("ca")
    fsa = postal_code[:3].upper()
    try:
        row = _nomi_ca.query_postal_code(fsa)
        lat = float(row.latitude)   # type: ignore[union-attr]
        lon = float(row.longitude)  # type: ignore[union-attr]
    except Exception:
        return None
    if math.isnan(lat) or math.isnan(lon):
        return None
    return lat, lon


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two lat/lon points."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _cache_key(merchant: str, fsa: str) -> str:
    """Normalised cache key for a (merchant, FSA) geocoding result."""
    normalised = merchant.lower().replace(" ", "").replace("&", "").replace("'", "")
    return f"geo:{normalised}:{fsa.upper()}"


def store_coords_cached(
    merchant: str, fsa: str, cache
) -> tuple[float, float] | None:
    """
    Return cached (lat, lon) for a store, or None if:
      - the key is not in cache yet (triggers background geocoding call-site), or
      - the cached value is None (previous geocoding attempt failed).
    Never makes a network call.
    """
    key = _cache_key(merchant, fsa)
    result = cache.get(key)
    if result is None:
        return None          # cache miss — caller should call kick_geocoding
    return result[0]         # result[0]=coords (may be None), result[1]=is_stale


def _nominatim_search(query: str) -> tuple[float, float] | None:
    """Call OSM Nominatim; returns (lat, lon) or None. One call only."""
    url = (
        _NOMINATIM_URL
        + "?q=" + urllib.parse.quote(query)
        + "&format=json&limit=1&countrycodes=ca"
    )
    req = urllib.request.Request(url, headers={"User-Agent": _NOMINATIM_UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None


def kick_geocoding(
    merchants: list[str], postal_code: str, cache
) -> None:
    """
    Start a background daemon thread to geocode uncached merchants.
    Merchants already in cache (even failed ones) are skipped.
    The thread opens its own SqliteCache connection to avoid thread-safety
    issues with the caller's shared connection.
    """
    fsa = postal_code[:3].upper()
    # Only geocode merchants not yet in cache at all
    to_geocode = [
        m for m in merchants
        if cache.get(_cache_key(m, fsa)) is None
    ]
    if not to_geocode:
        return

    db_path: str = cache.path   # SqliteCache exposes .path

    def _worker() -> None:
        from .cache import SqliteCache, STABLE_TTL  # local import to avoid circular
        thread_cache = SqliteCache(db_path, ttl=STABLE_TTL)
        try:
            for merchant in to_geocode:
                key = _cache_key(merchant, fsa)
                coords = _nominatim_search(f"{merchant} grocery {fsa} Canada")
                thread_cache.set(key, coords)
                time.sleep(_NOMINATIM_DELAY)
        finally:
            thread_cache.close()

    threading.Thread(target=_worker, daemon=True).start()
```

- [ ] **Step 5: Export STABLE_TTL from cache.py**

`SqliteCache` currently doesn't export `STABLE_TTL`. Check `apps/api/flipp/cache.py` — it does NOT have `STABLE_TTL`. Export it from `enrich.py` instead (it's defined there):

In `geocode.py` the worker imports `STABLE_TTL` from `.cache`. Since it's defined in `enrich.py`, either:

**Option A** (preferred — no circular import): define a standalone constant in `geocode.py` itself:

Replace the `from .cache import SqliteCache, STABLE_TTL` line in `_worker` with:

```python
def _worker() -> None:
    from .cache import SqliteCache
    _GEOCODE_TTL = 10 * 365 * 24 * 60 * 60   # 10 years
    thread_cache = SqliteCache(db_path, ttl=_GEOCODE_TTL)
    try:
        for merchant in to_geocode:
            key = _cache_key(merchant, fsa)
            coords = _nominatim_search(f"{merchant} grocery {fsa} Canada")
            thread_cache.set(key, coords)
            time.sleep(_NOMINATIM_DELAY)
    finally:
        thread_cache.close()
```

The full `geocode.py` `_worker` function should contain this corrected version. Update the file to use this approach.

- [ ] **Step 6: Run the geocode tests**

```bash
cd apps/api
python -m pytest tests/test_geocode.py -v
```

Expected: **6 PASSED**

- [ ] **Step 7: Update service.py to add distance_km**

In `apps/api/flipp/service.py`, add the import and modify `get_grocery_flyers`:

Replace:

```python
from . import stores
from .client import FlippError
```

With:

```python
from . import stores
from .client import FlippError
from .geocode import postal_code_coords, store_coords_cached, haversine_km, kick_geocoding
```

Replace the entire `get_grocery_flyers` method:

```python
def get_grocery_flyers(self, postal_code: str) -> dict:
    """All allow-listed grocery flyers available for a postal code."""
    pc = _normalize_pc(postal_code)

    def refresh():
        flyers = self.client.fetch_flyers(pc)
        return [
            {"id": f.get("id"), "merchant": f.get("merchant")}
            for f in flyers
            if stores.is_grocery_merchant(f.get("merchant", ""))
        ]

    flyer_list, stale = self._cached_or_refresh(f"flyers:{pc}", refresh)

    # Attach distances from geocode cache (non-blocking)
    user_coords: tuple[float, float] | None = None
    try:
        user_coords = postal_code_coords(pc)
    except Exception:
        pass

    fsa = pc[:3]
    flyers_with_dist = []
    needs_geocoding: list[str] = []

    for f in flyer_list:
        dist: float | None = None
        if user_coords:
            sc = store_coords_cached(f["merchant"], fsa, self.cache)
            if sc is not None:
                dist = round(
                    haversine_km(user_coords[0], user_coords[1], sc[0], sc[1]), 1
                )
            else:
                needs_geocoding.append(f["merchant"])
        flyers_with_dist.append({**f, "distance_km": dist})

    # Background-geocode any uncached stores (fire-and-forget)
    if needs_geocoding:
        kick_geocoding(needs_geocoding, pc, self.cache)

    # Sort: known distances ascending, unknown last (preserving Flipp order among unknowns)
    known = [(f["distance_km"], i, f) for i, f in enumerate(flyers_with_dist) if f["distance_km"] is not None]
    unknown = [f for f in flyers_with_dist if f["distance_km"] is None]
    sorted_flyers = [f for _, _, f in sorted(known, key=lambda x: x[0])] + unknown

    return {"postal_code": pc, "stale": stale, "flyers": sorted_flyers}
```

- [ ] **Step 8: Add a service integration test for distance_km field**

Add to the bottom of `apps/api/tests/test_service.py`:

```python
def test_get_grocery_flyers_includes_distance_km_field():
    """distance_km key must be present (may be None) on every returned flyer."""
    from flipp.service import FlyerRetrievalService
    client = FakeClient(flyers=[{"id": 1, "merchant": "Walmart"},
                                 {"id": 2, "merchant": "No Frills"}])
    cache = FakeCache()
    svc = FlyerRetrievalService(client, cache)
    result = svc.get_grocery_flyers("L4C0E6")
    assert len(result["flyers"]) == 2
    for f in result["flyers"]:
        assert "distance_km" in f
        assert f["distance_km"] is None or isinstance(f["distance_km"], float)
```

- [ ] **Step 9: Run the full API test suite**

```bash
cd apps/api
python -m pytest tests/ -v
```

Expected: All existing tests + new test pass. Note: `postal_code_coords` will attempt a real pgeocode lookup during service tests — since we're not mocking it, it may return `None` (pgeocode dataset not downloaded) or a value, but `distance_km` being `None` is allowed by the test.

- [ ] **Step 10: Commit**

```bash
git add apps/api/flipp/geocode.py apps/api/flipp/service.py apps/api/requirements.txt apps/api/tests/test_geocode.py apps/api/tests/test_service.py
git commit -m "feat(api): add geocode.py + distance_km to /api/flyers response

- pgeocode for offline Canadian FSA centroid lookup
- OSM Nominatim for store geocoding (background thread, SQLite cached)
- Haversine distance calculation
- /api/flyers now returns distance_km per store, sorted nearest-first
- Distance is null on first request; populated on subsequent requests
- Background geocoding uses its own SqliteCache connection (thread-safe)"
```

---

## Task 2: Backend — store_filter in /api/recommendations

**Files:**
- Modify: `apps/api/flipp/recommend.py`
- Modify: `apps/api/server.py`
- Test: `apps/api/tests/test_recommend.py`

- [ ] **Step 1: Write the failing store-filter tests**

Append to `apps/api/tests/test_recommend.py` (after the existing tests, before the end of file):

```python
def test_store_filter_limits_to_selected_stores():
    """With store_filter=["A"], only store A's items appear in the guide."""
    flyers = [{"id": 1, "merchant": "A"}, {"id": 2, "merchant": "B"}]
    flyer_map = {
        "A": _flyer("A", [_item("SPINACH", 1.0, "A")]),
        "B": _flyer("B", [_item("KALE", 0.5, "B")]),
    }
    enr_map = {
        "SPINACH": _enr("produce", "菠菜"),
        "KALE":    _enr("produce", "羽衣甘蓝"),
    }
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L4C0E6", store_filter=["A"])

    produce = next(g for g in result["weekly_guide"] if g["category"] == "produce")
    # B has cheaper item but is filtered out; A's item must be the best_store
    assert produce["best_store"] == "A"
    assert all(d["store"] == "A" for d in produce["deals"])


def test_store_filter_none_uses_all_stores():
    """store_filter=None must behave identically to calling with no filter."""
    flyers = [{"id": 1, "merchant": "A"}]
    flyer_map = {"A": _flyer("A", [_item("MILK", 3.0, "A")])}
    enr_map = {"MILK": _enr("dairy", "牛奶")}
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L4C0E6", store_filter=None)
    assert len(result["weekly_guide"]) > 0


def test_store_filter_empty_list_returns_empty_guide():
    """Filtering to zero stores must return an empty weekly_guide."""
    flyers = [{"id": 1, "merchant": "A"}]
    flyer_map = {"A": _flyer("A", [_item("MILK", 3.0, "A")])}
    enr_map = {"MILK": _enr("dairy", "牛奶")}
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L4C0E6", store_filter=[])
    assert result["weekly_guide"] == []
    assert result["shopping_route"] == []
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api
python -m pytest tests/test_recommend.py::test_store_filter_limits_to_selected_stores -v
```

Expected: **FAILED** — `generate()` does not accept `store_filter` keyword argument.

- [ ] **Step 3: Update recommend.py**

In `apps/api/flipp/recommend.py`, replace the `generate` method signature and add filtering:

```python
from .enrich import CATEGORIES
from . import stores as _stores_mod


class RecommendationEngine:
    def __init__(self, service, enricher):
        self.service = service
        self.enricher = enricher

    def generate(
        self,
        postal_code: str,
        store_filter: list[str] | None = None,
    ) -> dict:
        listing = self.service.get_grocery_flyers(postal_code)
        flyers = listing.get("flyers", [])

        # Apply store filter (normalised match to tolerate case/spacing differences)
        if store_filter is not None:
            filter_set = {_stores_mod._normalize(s) for s in store_filter}
            flyers = [
                f for f in flyers
                if _stores_mod._normalize(f["merchant"]) in filter_set
            ]

        # Collect priced grocery items per category across all stores
        # "other" is excluded: it maps to non-food items
        category_items: dict[str, list[dict]] = {
            cat: [] for cat in CATEGORIES if cat != "other"
        }

        for flyer_info in flyers:
            store = flyer_info["merchant"]
            flyer = self.service.get_flyer(store, postal_code)
            if flyer is None:
                continue
            priced = [i for i in flyer["items"] if i["price"] not in (None, "")]
            if not priced:
                continue
            enr = self.enricher.enrich([it["name"] for it in priced])
            for it in priced:
                e = enr.get(it["name"])
                if e is None or not e["is_grocery"]:
                    continue
                cat = e["category"]
                if cat in category_items:
                    category_items[cat].append({
                        "name": it["name"],
                        "zh_name": e["zh_name"],
                        "price": it["price"],
                        "price_text": it["price_text"],
                        "store": store,
                        "emoji": e["emoji"],
                        "category_zh": e["category_zh"],
                    })

        weekly_guide = []
        store_wins: dict[str, int] = {}

        for cat, items in category_items.items():
            if not items:
                continue
            best_item = min(items, key=lambda x: float(x["price"]))
            best_store = best_item["store"]
            store_items = sorted(
                [i for i in items if i["store"] == best_store],
                key=lambda x: float(x["price"]),
            )
            emoji, cat_zh = CATEGORIES[cat]
            weekly_guide.append({
                "category": cat,
                "emoji": emoji,
                "category_zh": cat_zh,
                "best_store": best_store,
                "deals": store_items[:3],
            })
            store_wins[best_store] = store_wins.get(best_store, 0) + 1

        shopping_route = sorted(
            store_wins, key=lambda s: store_wins[s], reverse=True
        )

        return {
            "postal_code": postal_code,
            "weekly_guide": weekly_guide,
            "shopping_route": shopping_route,
        }
```

- [ ] **Step 4: Run recommend tests**

```bash
cd apps/api
python -m pytest tests/test_recommend.py -v
```

Expected: **All 9 PASSED** (6 original + 3 new)

- [ ] **Step 5: Update server.py to accept stores param**

In `apps/api/server.py`, replace the `get_recommendations` endpoint:

```python
@app.get("/api/recommendations")
def get_recommendations(
    postal_code: str = Query(..., min_length=6),
    stores: str | None = Query(None),   # comma-separated merchant names
    user_id: str = Depends(get_current_user),
):
    t0 = time.monotonic()
    store_filter: list[str] | None = None
    if stores:
        store_filter = [s.strip() for s in stores.split(",") if s.strip()]
    try:
        engine = RecommendationEngine(_make_service(), _make_enricher())
        result = engine.generate(postal_code, store_filter=store_filter)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    log_search(
        user_id=user_id,
        postal_code=postal_code,
        query_type="recommendations",
        flyer_category="groceries",
        response_ms=int((time.monotonic() - t0) * 1000),
    )
    return result
```

- [ ] **Step 6: Run the full API test suite**

```bash
cd apps/api
python -m pytest tests/ -v
```

Expected: **All tests pass**

- [ ] **Step 7: Smoke test the new endpoint**

Start the server (`uvicorn server:app --reload --port 8000`) and test:

```bash
# All stores (existing behaviour)
curl "http://localhost:8000/api/recommendations?postal_code=L4C0E6" \
  -H "Authorization: Bearer <token>"

# Filtered (replace with real merchant names from /api/flyers response)
curl "http://localhost:8000/api/recommendations?postal_code=L4C0E6&stores=No+Frills" \
  -H "Authorization: Bearer <token>"
```

Expected: filtered result contains only No Frills items.

- [ ] **Step 8: Commit**

```bash
git add apps/api/flipp/recommend.py apps/api/server.py apps/api/tests/test_recommend.py
git commit -m "feat(api): add store_filter param to /api/recommendations

- recommend.py generate() accepts store_filter: list[str] | None
- /api/recommendations?stores=A,B filters weekly guide to named stores
- Empty list returns empty weekly_guide; None uses all stores (unchanged)
- Normalised merchant name matching (case-insensitive)"
```

---

## Task 3: Web — flyer detail category grouping + price sort

**Files:**
- Create: `apps/web/components/CategoryItemGroup.tsx`
- Modify: `apps/web/app/flyers/[store]/page.tsx`

- [ ] **Step 1: Create CategoryItemGroup.tsx**

Create `apps/web/components/CategoryItemGroup.tsx`:

```tsx
import type { FlyerItem } from "@/lib/api";

interface Props {
  emoji: string;
  label: string;     // Chinese category label e.g. "蔬果"
  items: FlyerItem[]; // already sorted by price ascending by the caller
}

export default function CategoryItemGroup({ emoji, label, items }: Props) {
  return (
    <div>
      {/* Category header */}
      <div className="flex items-center gap-2 px-1 pt-4 pb-2">
        <span aria-hidden="true" className="text-lg">{emoji}</span>
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">({items.length})</span>
      </div>

      {/* Items card */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.zh_name}</div>
              {item.price_text && (
                <div className="text-xs text-gray-400 truncate">{item.price_text}</div>
              )}
            </div>
            <div className="font-bold text-green-700 flex-shrink-0 text-sm">
              {item.price != null ? `$${Number(item.price).toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note: `apps/web/lib/api.ts`'s `FlyerItem` does not yet have `price_text`. Check — it doesn't. Add it in Task 4 along with the other api.ts changes. For now, use optional chaining `item.price_text?` or add `price_text?: string` to `FlyerItem` now.

**Add `price_text` to web FlyerItem now** — open `apps/web/lib/api.ts` and change:

```typescript
export interface FlyerItem {
  name: string;
  price: number;
  category: string;
  emoji: string;
  category_zh: string;
  zh_name: string;
  is_grocery: boolean;
}
```

to:

```typescript
export interface FlyerItem {
  name: string;
  price: number;
  price_text?: string;
  category: string;
  emoji: string;
  category_zh: string;
  zh_name: string;
  is_grocery: boolean;
}
```

- [ ] **Step 2: Update flyers/[store]/page.tsx to use CategoryItemGroup**

Replace the entire file content of `apps/web/app/flyers/[store]/page.tsx`:

```tsx
import Link from "next/link";
import CategoryItemGroup from "@/components/CategoryItemGroup";
import { getFlyer, type FlyerItem } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ postal_code?: string }>;
}

interface CategoryGroup {
  emoji: string;
  label: string;
  items: FlyerItem[];
}

/** Group grocery items by category, sort each group by price ascending. */
function groupByCategory(items: FlyerItem[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const item of items) {
    if (!item.is_grocery) continue;
    const key = item.category;
    if (!map.has(key)) {
      map.set(key, { emoji: item.emoji, label: item.category_zh, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  // Sort items within each group by price ascending
  for (const group of map.values()) {
    group.items.sort((a, b) => Number(a.price) - Number(b.price));
  }
  // Return groups sorted by category name so the order is stable
  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "zh")
  );
}

export default async function StoreFlyerPage({ params, searchParams }: Props) {
  const { store: storeParam } = await params;
  const { postal_code } = await searchParams;
  const store = decodeURIComponent(storeParam);
  const pc = postal_code ?? "";

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  let data;
  try {
    data = await getFlyer(store, pc, token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("404")) {
      return (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-500">该超市暂无传单 / No flyer available</p>
          <Link href={`/flyers?postal_code=${pc}`} className="text-blue-600 underline">
            返回列表
          </Link>
        </div>
      );
    }
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyer
      </div>
    );
  }

  const groups = groupByCategory(data.items);
  const totalGroceries = groups.reduce((sum, g) => sum + g.items.length, 0);
  const filtered = data.items.length - totalGroceries;

  return (
    <div className="space-y-2">
      <Link
        href={`/flyers?postal_code=${pc}`}
        className="text-blue-600 text-sm inline-block"
      >
        ← 返回列表
      </Link>

      <div>
        <h2 className="text-xl font-bold">{data.store}</h2>
        <p className="text-sm text-gray-500">
          共 {totalGroceries} 个特价商品 / {totalGroceries} priced items
        </p>
      </div>

      {data.stale && (
        <p className="text-orange-600 text-sm bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新 / Served from cache, may not be current
        </p>
      )}

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-gray-400">
          暂无商品数据 / No items available
        </div>
      ) : (
        groups.map((group) => (
          <CategoryItemGroup
            key={group.label}
            emoji={group.emoji}
            label={group.label}
            items={group.items}
          />
        ))
      )}

      {filtered > 0 && (
        <p className="text-sm text-gray-400 text-center">
          已过滤 {filtered} 个非食品商品 / filtered {filtered} non-grocery items
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Start web dev server (`npm run dev` in `apps/web`). Navigate to a store flyer page. Verify:
- Items are grouped by category with emoji header
- Within each category, items are sorted cheapest first
- No regression in page load or 404 handling

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/CategoryItemGroup.tsx apps/web/app/flyers/[store]/page.tsx apps/web/lib/api.ts
git commit -m "feat(web): group flyer items by category, sort by price ascending

- New CategoryItemGroup component renders emoji header + price-sorted items
- flyers/[store]/page.tsx groups items by category_zh using groupByCategory()
- Groups sorted by Chinese category name for stable order
- FlyerItem type gets optional price_text field"
```

---

## Task 4: Web — store list with distances + StoreSelector + filtered recommendations

**Files:**
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/components/StoreSelector.tsx`
- Modify: `apps/web/app/flyers/page.tsx`
- Modify: `apps/web/app/recommendations/page.tsx`

- [ ] **Step 1: Update apps/web/lib/api.ts**

1. Add `distance_km?` to `FlyerInfo`:

```typescript
export interface FlyerInfo {
  id: number;
  merchant: string;
  distance_km?: number | null;
}
```

2. Update `getRecommendations` to accept an optional `stores` filter:

```typescript
export function getRecommendations(
  postalCode: string,
  token: string,
  stores?: string[],
): Promise<RecommendationsResponse> {
  const params = new URLSearchParams({
    postal_code: postalCode,
  });
  if (stores && stores.length > 0) {
    params.set("stores", stores.join(","));
  }
  return fetchJson<RecommendationsResponse>(
    `/api/recommendations?${params.toString()}`,
    token,
  );
}
```

- [ ] **Step 2: Create StoreSelector.tsx**

Create `apps/web/components/StoreSelector.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { FlyerInfo } from "@/lib/api";

interface Props {
  flyers: FlyerInfo[];
  postalCode: string;
}

export default function StoreSelector({ flyers, postalCode }: Props) {
  // Default: all stores selected
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(flyers.map((f) => f.merchant))
  );

  const toggleStore = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) {
        next.delete(merchant);
      } else {
        next.add(merchant);
      }
      return next;
    });
  };

  const allSelected = selected.size === flyers.length;
  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(flyers.map((f) => f.merchant))
    );

  // Build recommendations URL: omit stores param when all are selected (= same as all)
  const selectedArr = Array.from(selected);
  const recsHref =
    selectedArr.length === 0
      ? null
      : selectedArr.length === flyers.length
      ? `/recommendations?postal_code=${postalCode}`
      : `/recommendations?postal_code=${postalCode}&stores=${encodeURIComponent(
          selectedArr.join(",")
        )}`;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggleAll}
          className="text-sm text-blue-600 hover:underline"
        >
          {allSelected ? "取消全选" : "全选"}
        </button>
        {recsHref ? (
          <Link
            href={recsHref}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition"
          >
            本周推荐 ({selected.size}家) →
          </Link>
        ) : (
          <span className="text-sm text-gray-400 px-4 py-2">
            请选择至少一家超市
          </span>
        )}
      </div>

      {/* Store grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {flyers.map((f) => {
          const isSelected = selected.has(f.merchant);
          return (
            <div
              key={f.id}
              className={`bg-white border rounded-xl p-4 cursor-pointer transition select-none ${
                isSelected
                  ? "border-blue-400 shadow-sm"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => toggleStore(f.merchant)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && toggleStore(f.merchant)}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox indicator */}
                <div
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    isSelected
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Store info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">
                    {f.merchant}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <Link
                      href={`/flyers/${encodeURIComponent(f.merchant)}?postal_code=${postalCode}`}
                      className="text-sm text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      查看传单 →
                    </Link>
                    {f.distance_km != null && (
                      <span className="text-xs text-gray-400">
                        📍 ~{f.distance_km} km
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update apps/web/app/flyers/page.tsx to use StoreSelector**

Replace the entire file:

```tsx
import Link from "next/link";
import StoreSelector from "@/components/StoreSelector";
import { getFlyers } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface Props {
  searchParams: Promise<{ postal_code?: string }>;
}

export default async function FlyersPage({ searchParams }: Props) {
  const { postal_code } = await searchParams;
  const pc = postal_code ?? "";

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  if (!pc) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">请先输入邮编 / Please enter a postal code</p>
        <Link href="/" className="text-blue-600 underline">返回首页</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getFlyers(pc, token);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyers
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">邮编 {data.postal_code} 的传单</h2>
        <p className="text-sm text-gray-500">
          共 {data.flyers.length} 家超市 / {data.flyers.length} stores
        </p>
      </div>

      {data.stale && (
        <p className="text-orange-600 text-sm bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新 / Served from cache, may not be current
        </p>
      )}

      <StoreSelector flyers={data.flyers} postalCode={pc} />
    </div>
  );
}
```

- [ ] **Step 4: Update apps/web/app/recommendations/page.tsx**

Replace the entire file:

```tsx
import Link from "next/link";
import CategoryBlock from "@/components/CategoryBlock";
import { getRecommendations } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface Props {
  searchParams: Promise<{ postal_code?: string; stores?: string }>;
}

export default async function RecommendationsPage({ searchParams }: Props) {
  const { postal_code, stores: storesParam } = await searchParams;
  const pc = postal_code ?? "";
  const storeFilter = storesParam
    ? storesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  if (!pc) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">请先输入邮编 / Please enter a postal code</p>
        <Link href="/" className="text-blue-600 underline">返回首页</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getRecommendations(pc, token, storeFilter);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法生成推荐，请稍后重试 / Could not generate recommendations
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">本周最优惠</h2>
        <p className="text-sm text-gray-500">
          This Week&apos;s Best Deals · {data.postal_code}
          {storeFilter && storeFilter.length > 0 && (
            <> · 已筛选 {storeFilter.length} 家超市</>
          )}
        </p>
      </div>

      {storeFilter && storeFilter.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 flex items-center justify-between">
          <span>仅显示：{storeFilter.join("、")}</span>
          <Link
            href={`/flyers?postal_code=${pc}`}
            className="underline text-blue-600 ml-2 flex-shrink-0"
          >
            重新选择
          </Link>
        </div>
      )}

      {data.shopping_route.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="text-sm font-semibold text-blue-800 mb-1">
            <span aria-hidden="true">🗺</span> 建议购物路线 / Shopping Route
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {data.shopping_route.map((store, i) => (
              <span key={i} className="text-blue-700 text-sm">
                {i + 1}. {store}
                {i < data.shopping_route.length - 1 ? " →" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.weekly_guide.length === 0 ? (
        <p className="text-gray-400 text-center py-8">暂无推荐数据 / No data available</p>
      ) : (
        <div className="space-y-4">
          {data.weekly_guide.map((guide) => (
            <CategoryBlock key={guide.category} guide={guide} />
          ))}
        </div>
      )}

      <div className="text-center pt-2">
        <Link
          href={`/flyers?postal_code=${pc}`}
          className="text-blue-600 text-sm underline"
        >
          查看各超市传单 / Browse all flyers
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

1. Navigate to `/flyers?postal_code=L4C0E6`. Verify:
   - Store cards show checkboxes (all checked by default)
   - "本周推荐 (N家) →" button appears
   - Distances show as "📍 ~X km" if geocoding has run (may be absent on first request)
   - Deselecting a store updates the button label
   - "查看传单 →" link still navigates to flyer detail
2. With some stores unchecked, click "本周推荐". Verify recommendations page shows only selected store items.
3. Check "重新选择" link goes back to flyers page.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api.ts apps/web/components/StoreSelector.tsx apps/web/app/flyers/page.tsx apps/web/app/recommendations/page.tsx
git commit -m "feat(web): store selector + distance labels + filtered recommendations

- FlyerInfo gets distance_km field (shown as '📍 ~X km')
- StoreSelector client component: checkboxes + filtered recommendations link
- All stores selected by default; stores param omitted when all selected
- Recommendations page reads ?stores=A,B param, shows active filter label
- getRecommendations() accepts optional stores[] param"
```

---

## Task 5: Mobile — flyer detail price sort

**Files:**
- Modify: `apps/mobile/app/flyer/[store].tsx`

This is a minimal single-file change — sort `filteredItems` by price within the existing `useMemo`.

- [ ] **Step 1: Update filteredItems useMemo in [store].tsx**

In `apps/mobile/app/flyer/[store].tsx`, find and replace the `filteredItems` useMemo:

Old code:

```tsx
const filteredItems = useMemo<FlyerItem[]>(() => {
  if (!data) return [];
  const groceryItems = data.items.filter((i) => i.is_grocery);
  if (activeCategory === "all") return groceryItems;
  return groceryItems.filter((i) => i.category === activeCategory);
}, [data, activeCategory]);
```

New code:

```tsx
const filteredItems = useMemo<FlyerItem[]>(() => {
  if (!data) return [];
  const groceryItems = data.items.filter((i) => i.is_grocery);
  const categoryFiltered =
    activeCategory === "all"
      ? groceryItems
      : groceryItems.filter((i) => i.category === activeCategory);
  // Sort by price ascending within the active filter
  return [...categoryFiltered].sort((a, b) => Number(a.price) - Number(b.price));
}, [data, activeCategory]);
```

Note: `[...categoryFiltered]` creates a shallow copy before sorting so the original data array is not mutated.

- [ ] **Step 2: Verify on device/simulator**

Open a store flyer in the mobile app. Verify:
- Items are sorted cheapest first in each category view
- Changing category chip still works; new category also sorted by price
- No visual regression

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/flyer/[store].tsx
git commit -m "feat(mobile): sort flyer items by price ascending

Sort filtered items within each category chip view by price ascending.
Spreads array to avoid mutating the cached data."
```

---

## Task 6: Mobile — store list distances + selection + filtered recommendations

**Files:**
- Modify: `apps/mobile/lib/api.ts`
- Modify: `apps/mobile/components/StoreItem.tsx`
- Modify: `apps/mobile/app/(tabs)/stores.tsx`
- Modify: `apps/mobile/app/(tabs)/recommendations.tsx`

- [ ] **Step 1: Update apps/mobile/lib/api.ts**

1. Add `distance_km?` to `FlyerInfo`:

```typescript
export interface FlyerInfo {
  id: number;
  merchant: string;
  distance_km?: number | null;
}
```

2. Update `getRecommendations` to accept an optional `stores` array:

```typescript
export function getRecommendations(
  postalCode: string,
  stores?: string[]
): Promise<RecommendationsResponse> {
  const params = new URLSearchParams({
    postal_code: encodeURIComponent(postalCode),
  });
  if (stores && stores.length > 0) {
    params.set("stores", stores.join(","));
  }
  return fetchJson<RecommendationsResponse>(
    `/api/recommendations?${params.toString()}`
  );
}
```

Wait — `encodeURIComponent` inside `URLSearchParams` double-encodes. Fix:

```typescript
export function getRecommendations(
  postalCode: string,
  stores?: string[]
): Promise<RecommendationsResponse> {
  let path = `/api/recommendations?postal_code=${encodeURIComponent(postalCode)}`;
  if (stores && stores.length > 0) {
    path += `&stores=${encodeURIComponent(stores.join(","))}`;
  }
  return fetchJson<RecommendationsResponse>(path);
}
```

- [ ] **Step 2: Update StoreItem.tsx**

Replace `apps/mobile/components/StoreItem.tsx`:

```tsx
import { TouchableOpacity, View, Text } from "react-native";

interface Props {
  merchant: string;
  distanceKm?: number | null;
  selected: boolean;
  onToggleSelect: () => void;
  onNavigate: () => void;
}

export default function StoreItem({
  merchant,
  distanceKm,
  selected,
  onToggleSelect,
  onNavigate,
}: Props) {
  return (
    <View className="bg-white border border-gray-200 rounded-lg mb-3 flex-row items-stretch overflow-hidden">
      {/* Checkbox touch zone (left) */}
      <TouchableOpacity
        className={`w-14 items-center justify-center border-r ${
          selected ? "bg-blue-50 border-blue-200" : "border-gray-100"
        }`}
        onPress={onToggleSelect}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${selected ? "取消选择" : "选择"} ${merchant}`}
      >
        <View
          className={`w-5 h-5 rounded border-2 items-center justify-center ${
            selected ? "bg-blue-500 border-blue-500" : "border-gray-300"
          }`}
        >
          {selected && (
            <Text className="text-white text-xs font-bold">✓</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Store info + navigation (right) */}
      <TouchableOpacity
        className="flex-1 px-4 py-4 flex-row items-center justify-between"
        onPress={onNavigate}
        accessibilityRole="button"
        accessibilityLabel={`查看 ${merchant} 传单`}
      >
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <Text className="text-2xl" accessibilityElementsHidden>🏪</Text>
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
              {merchant}
            </Text>
            {distanceKm != null && (
              <Text className="text-xs text-gray-400 mt-0.5">
                📍 ~{distanceKm} km
              </Text>
            )}
          </View>
        </View>
        <Text className="text-blue-500 text-sm ml-2">查看传单 →</Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 3: Update stores.tsx**

Replace `apps/mobile/app/(tabs)/stores.tsx`:

```tsx
import { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { usePostalCode } from "../../lib/PostalCodeContext";
import { getFlyers, type FlyersResponse } from "../../lib/api";
import StoreItem from "../../components/StoreItem";

export default function StoresScreen() {
  const { postalCode } = usePostalCode();
  const router = useRouter();
  const [data, setData] = useState<FlyersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection when postal code or data changes
  useEffect(() => {
    if (!postalCode) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getFlyers(postalCode)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          // Select all stores by default
          setSelected(new Set(d.flyers.map((f) => f.merchant)));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败，请重试");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postalCode, retryKey]);

  const allSelected = useMemo(
    () => data != null && selected.size === data.flyers.length,
    [selected, data]
  );

  const toggleStore = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) {
        next.delete(merchant);
      } else {
        next.add(merchant);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    setSelected(
      allSelected ? new Set() : new Set(data.flyers.map((f) => f.merchant))
    );
  };

  const handleRecommend = () => {
    if (!data) return;
    const selectedArr = Array.from(selected);
    const params: Record<string, string> = {};
    // Only pass stores param when it's a subset (not all selected)
    if (selectedArr.length > 0 && selectedArr.length < data.flyers.length) {
      params.stores = selectedArr.join(",");
    }
    router.push({
      pathname: "/(tabs)/recommendations",
      params,
    });
  };

  if (!postalCode) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-400 text-center">
          请先在首页输入邮编{"\n"}Please enter a postal code first
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3">正在加载超市列表...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-red-500 text-center mb-4">{error}</Text>
        <TouchableOpacity
          className="bg-blue-500 rounded-lg px-6 py-3"
          onPress={() => setRetryKey((k) => k + 1)}
        >
          <Text className="text-white font-bold">重新加载</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const flyers = data?.flyers ?? [];

  return (
    <View className="flex-1 bg-gray-50">
      {data?.stale && (
        <View className="bg-orange-100 px-4 py-2">
          <Text className="text-orange-700 text-xs text-center">
            显示的是缓存数据，可能不是最新传单
          </Text>
        </View>
      )}

      <FlatList
        data={flyers}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold text-gray-900">
              附近超市 · {postalCode}
            </Text>
            {flyers.length > 0 && (
              <TouchableOpacity onPress={toggleAll}>
                <Text className="text-blue-500 text-sm">
                  {allSelected ? "取消全选" : "全选"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text className="text-gray-400 text-center mt-8">
            该地区暂无传单 / No flyers available
          </Text>
        }
        renderItem={({ item }) => (
          <StoreItem
            merchant={item.merchant}
            distanceKm={item.distance_km}
            selected={selected.has(item.merchant)}
            onToggleSelect={() => toggleStore(item.merchant)}
            onNavigate={() =>
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.merchant, postal_code: postalCode },
              })
            }
          />
        )}
      />

      {/* Sticky bottom: Generate Recommendations button */}
      {flyers.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
          <TouchableOpacity
            className={`rounded-xl py-3 items-center ${
              selected.size === 0 ? "bg-gray-300" : "bg-green-600"
            }`}
            onPress={handleRecommend}
            disabled={selected.size === 0}
          >
            <Text className="text-white font-bold text-base">
              {selected.size === 0
                ? "请选择至少一家超市"
                : `本周推荐 · ${selected.size}家超市 →`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Update recommendations.tsx to use stores URL param**

Replace `apps/mobile/app/(tabs)/recommendations.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { usePostalCode } from "../../lib/PostalCodeContext";
import { getRecommendations, type RecommendationsResponse } from "../../lib/api";
import CategoryCard from "../../components/CategoryCard";

export default function RecommendationsScreen() {
  const { postalCode } = usePostalCode();
  const router = useRouter();
  const { stores: storesParam } = useLocalSearchParams<{ stores?: string }>();
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const storeFilter: string[] | undefined = storesParam
    ? storesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  useEffect(() => {
    if (!postalCode) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getRecommendations(postalCode, storeFilter)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败，请重试");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postalCode, storesParam, retryKey]);   // re-fetch when storesParam changes

  if (!postalCode) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-400 text-center">
          请先在首页输入邮编{"\n"}Please enter a postal code first
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3">正在加载本周特价...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-red-500 text-center mb-4">{error}</Text>
        <TouchableOpacity
          className="bg-blue-500 rounded-lg px-6 py-3"
          onPress={() => setRetryKey((k) => k + 1)}
        >
          <Text className="text-white font-bold">重新查找</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || data.weekly_guide.length === 0) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-400 text-center">
          该地区暂无传单数据{"\n"}No flyer data available
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={data.weekly_guide}
        keyExtractor={(item) => item.category}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-base font-bold text-gray-900">
              本周推荐 · {postalCode}
            </Text>
            {storeFilter && storeFilter.length > 0 && (
              <Text className="text-xs text-blue-600 mt-1">
                已筛选 {storeFilter.length} 家超市
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CategoryCard
            guide={item}
            postalCode={postalCode}
            onPress={() =>
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.best_store, postal_code: postalCode },
              })
            }
          />
        )}
      />
    </View>
  );
}
```

Note: `eslint` may warn about `storeFilter` in the `useEffect` deps — it's derived from `storesParam` which IS in the deps, so the warning can be suppressed with `// eslint-disable-next-line react-hooks/exhaustive-deps` or by just keeping `storesParam` as the dep (which is what the code above does).

- [ ] **Step 5: Verify on device/simulator**

1. Enter postal code on home screen.
2. Go to stores tab. Verify:
   - Each store card has a checkbox on the left.
   - Distances show if geocoding has run ("📍 ~X km").
   - Tapping the checkbox area toggles selection.
   - Tapping the "查看传单 →" area navigates to flyer detail.
   - Bottom bar shows "本周推荐 · N家超市 →".
3. Deselect some stores. Tap "本周推荐". Verify recommendations tab shows only selected stores' items.
4. Go back to stores tab; selection state is preserved within the session.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/api.ts apps/mobile/components/StoreItem.tsx apps/mobile/app/(tabs)/stores.tsx apps/mobile/app/(tabs)/recommendations.tsx
git commit -m "feat(mobile): store selection + distances + filtered recommendations

- FlyerInfo type gets distance_km (shown as '📍 ~X km' under store name)
- StoreItem split into checkbox zone (left) + navigation zone (right)
- stores.tsx: per-store checkbox, select-all toggle, sticky Recommend button
- recommendations.tsx: reads stores URL param, re-fetches when it changes
- getRecommendations() accepts optional stores[] param"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Feature 1 (category grouping + price sort): Task 3 (web) + Task 5 (mobile)
- [x] Feature 2 (store selector → filtered recommendations): Task 2 (backend) + Task 4 (web) + Task 6 (mobile)
- [x] Feature 3 (distance sort, km labels): Task 1 (backend) + Task 4 (web FlyerInfo + StoreSelector) + Task 6 (mobile StoreItem)
- [x] Web and mobile both updated

**Type consistency across tasks:**
- `FlyerInfo.distance_km?: number | null` — added in Task 1 (backend), Task 4 (web api.ts), Task 6 (mobile api.ts)
- `RecommendationEngine.generate(pc, store_filter?)` — defined in Task 2, tested in Task 2
- `getRecommendations(pc, token, stores?)` (web) — Task 4
- `getRecommendations(pc, stores?)` (mobile) — Task 6
- `StoreItem` props — `merchant, distanceKm?, selected, onToggleSelect, onNavigate` — defined in Task 6, used in Task 6 stores.tsx

**Thread safety:** `kick_geocoding` opens its own `SqliteCache` connection inside the thread. The caller's `cache` object is only used for `.get()` (read) during setup, which is safe.

**First-request behaviour:** On first call, no geocoding results are cached. All `distance_km` values are `null`. Stores are returned in Flipp's implicit proximity order. Background thread starts geocoding. On second request (~10+ seconds later), distances are available.

**pgeocode dataset download:** On first import, `pgeocode.Nominatim("ca")` downloads the Canadian postal code database (~1 MB) if not already cached by pgeocode. This happens once per machine. In CI/CD, the dataset is cached by pgeocode in the user's home directory.
