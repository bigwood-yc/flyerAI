"""Service orchestration — cache-first, refresh, graceful degradation. No network."""

import pytest

from flipp.client import FlippError
from flipp.service import FlyerRetrievalService


class FakeClient:
    """A stand-in for FlippClient with controllable behavior and call counts."""
    def __init__(self, flyers=None, items=None, fail=False):
        self._flyers = flyers or []
        self._items = items or []
        self.fail = fail
        self.flyer_calls = 0
        self.item_calls = 0

    def fetch_flyers(self, postal_code):
        self.flyer_calls += 1
        if self.fail:
            raise FlippError("boom")
        return self._flyers

    def fetch_items(self, flyer_id):
        self.item_calls += 1
        if self.fail:
            raise FlippError("boom")
        return self._items


class FakeCache:
    """In-memory cache that lets a test mark entries fresh or stale."""
    path = ":memory:"

    def __init__(self):
        self.store = {}      # key -> value
        self.stale = set()   # keys that should report stale

    def get(self, key):
        if key not in self.store:
            return None
        return self.store[key], (key in self.stale)

    def set(self, key, value):
        self.store[key] = value
        self.stale.discard(key)


SAMPLE_FLYERS = [
    {"id": 1, "merchant": "Walmart"},
    {"id": 2, "merchant": "Subway"},          # noise, must be filtered out
    {"id": 3, "merchant": "No Frills"},
]


def test_filters_to_grocery_merchants():
    svc = FlyerRetrievalService(FakeClient(flyers=SAMPLE_FLYERS), FakeCache())
    result = svc.get_grocery_flyers("L3R0B1")
    merchants = {f["merchant"] for f in result["flyers"]}
    assert merchants == {"Walmart", "No Frills"}
    assert result["stale"] is False


def test_fresh_cache_skips_network():
    client = FakeClient(flyers=SAMPLE_FLYERS)
    cache = FakeCache()
    svc = FlyerRetrievalService(client, cache)
    svc.get_grocery_flyers("L3R0B1")        # first call populates cache
    assert client.flyer_calls == 1
    svc.get_grocery_flyers("L3R0B1")        # second call should hit cache
    assert client.flyer_calls == 1          # no extra network call


def test_stale_cache_triggers_refresh():
    client = FakeClient(flyers=SAMPLE_FLYERS)
    cache = FakeCache()
    cache.set("flyers:L3R0B1", [{"id": 9, "merchant": "Old"}])
    cache.stale.add("flyers:L3R0B1")
    svc = FlyerRetrievalService(client, cache)
    result = svc.get_grocery_flyers("L3R0B1")
    assert client.flyer_calls == 1                       # refreshed
    assert {f["merchant"] for f in result["flyers"]} == {"Walmart", "No Frills"}
    assert result["stale"] is False


def test_degrades_to_stale_cache_on_failure():
    client = FakeClient(fail=True)
    cache = FakeCache()
    cache.set("flyers:L3R0B1", [{"id": 1, "merchant": "Walmart"}])
    cache.stale.add("flyers:L3R0B1")
    svc = FlyerRetrievalService(client, cache)
    result = svc.get_grocery_flyers("L3R0B1")
    assert result["stale"] is True                       # served stale, not failed
    assert result["flyers"][0]["merchant"] == "Walmart"


def test_raises_when_no_cache_and_fetch_fails():
    svc = FlyerRetrievalService(FakeClient(fail=True), FakeCache())
    with pytest.raises(FlippError):
        svc.get_grocery_flyers("L3R0B1")


def test_get_flyer_returns_items_for_store():
    items = [
        {"name": "Spinach", "price": 2.5,
         "current_price_text": "$2.50 / bag",
         "valid_from": "a", "valid_to": "b"},
        {"name": "Buns", "price": None, "valid_from": "a", "valid_to": "b"},
    ]
    client = FakeClient(flyers=SAMPLE_FLYERS, items=items)
    svc = FlyerRetrievalService(client, FakeCache())
    flyer = svc.get_flyer("Walmart", "L3R0B1")
    assert flyer["store"] == "Walmart"
    assert flyer["flyer_id"] == 1
    assert flyer["items"][0]["name"] == "Spinach"
    assert flyer["items"][0]["merchant"] == "Walmart"
    assert flyer["items"][0]["price_text"] == "$2.50 / bag"


def test_clean_item_price_text_fallback():
    """_clean_item uses current_price_text, falls back to price_text, then empty string."""
    items_variants = [
        # only current_price_text
        ({"name": "A", "price": 1.0, "current_price_text": "$1.00 / lb"}, "$1.00 / lb"),
        # only price_text (no current_price_text)
        ({"name": "B", "price": 2.0, "price_text": "$2.00 / bag"}, "$2.00 / bag"),
        # neither field
        ({"name": "C", "price": 3.0}, ""),
    ]
    for raw_item, expected_price_text in items_variants:
        raw_item.setdefault("valid_from", None)
        raw_item.setdefault("valid_to", None)
        client = FakeClient(flyers=SAMPLE_FLYERS, items=[raw_item])
        svc = FlyerRetrievalService(client, FakeCache())
        flyer = svc.get_flyer("Walmart", "L3R0B1")
        assert flyer["items"][0]["price_text"] == expected_price_text, \
            f"Expected {expected_price_text!r} for raw={raw_item}"


def test_get_flyer_none_for_unknown_store():
    svc = FlyerRetrievalService(FakeClient(flyers=SAMPLE_FLYERS), FakeCache())
    assert svc.get_flyer("Costco", "L3R0B1") is None


def test_get_grocery_flyers_includes_distance_km_field():
    """distance_km key must be present (may be None) on every returned flyer."""
    client = FakeClient(flyers=[{"id": 1, "merchant": "Walmart"},
                                 {"id": 2, "merchant": "No Frills"}])
    cache = FakeCache()
    svc = FlyerRetrievalService(client, cache)
    result = svc.get_grocery_flyers("L4C0E6")
    assert len(result["flyers"]) == 2
    for f in result["flyers"]:
        assert "distance_km" in f
        assert f["distance_km"] is None or isinstance(f["distance_km"], float)


# FreshPro tests

from flipp.custom_sources import FRESHPRO_STORES


class _FakeFreshProScraper:
    """Fake scraper with a .store attribute so _nearest_freshpro() can read coords."""
    def __init__(self, store_meta=None, items=None):
        self.store = store_meta or FRESHPRO_STORES[0]
        self._items = items if items is not None else [{"name": "DRAGON FRUIT", "price": 1.99, "price_text": "$1.99 ea"}]
    def fetch_items(self): return self._items


def _make_svc(scrapers):
    return FlyerRetrievalService(FakeClient(), FakeCache(), freshpro_scrapers=scrapers)


def test_flyers_list_includes_freshpro():
    result = _make_svc([_FakeFreshProScraper()]).get_grocery_flyers("L3R0B1")
    merchants = [f["merchant"] for f in result["flyers"]]
    assert "FreshPro Foodmart" in merchants


def test_get_flyer_for_freshpro_returns_items():
    scraper = _FakeFreshProScraper(items=[{"name": "DRAGON FRUIT", "price": 1.99, "price_text": "$1.99 ea"}])
    flyer = _make_svc([scraper]).get_flyer("FreshPro Foodmart", "L3R0B1")
    assert flyer is not None
    assert flyer["store"] == "FreshPro Foodmart"
    assert len(flyer["items"]) == 1
    assert flyer["items"][0]["name"] == "DRAGON FRUIT"


def test_flyers_list_freshpro_entry_has_required_fields():
    result = _make_svc([_FakeFreshProScraper()]).get_grocery_flyers("L3R0B1")
    fp_entry = next(f for f in result["flyers"] if f["merchant"] == "FreshPro Foodmart")
    # flyer_id comes from scraper.store["flyer_id"] → FRESHPRO_STORES[0]["flyer_id"]
    assert fp_entry["id"] == "freshpro:rh"
    assert "distance_km" in fp_entry
    assert "address" in fp_entry


def test_flyers_list_excludes_freshpro_when_no_scrapers():
    svc = FlyerRetrievalService(FakeClient(), FakeCache())
    result = svc.get_grocery_flyers("L3R0B1")
    merchants = [f["merchant"] for f in result["flyers"]]
    assert "FreshPro Foodmart" not in merchants


def test_get_flyer_for_freshpro_with_empty_items():
    flyer = _make_svc([_FakeFreshProScraper(items=[])]).get_flyer("FreshPro Foodmart", "L3R0B1")
    assert flyer is not None
    assert flyer["items"] == []


def test_nearest_freshpro_selects_closest_by_coords():
    """_nearest_freshpro picks the scraper with the closest store coords."""
    rh_scraper = _FakeFreshProScraper(
        store_meta=FRESHPRO_STORES[0],  # freshpro:rh, coords (43.9028, -79.4410)
        items=[{"name": "RH ITEM", "price": 1.0, "price_text": "$1.00"}],
    )
    bram_scraper = _FakeFreshProScraper(
        store_meta=FRESHPRO_STORES[1],  # freshpro:brampton, coords (43.7378, -79.6963)
        items=[{"name": "BRAM ITEM", "price": 2.0, "price_text": "$2.00"}],
    )
    svc = _make_svc([rh_scraper, bram_scraper])

    # User near Richmond Hill — RH wins
    assert svc._nearest_freshpro((43.88, -79.44)) is rh_scraper
    # User near Brampton — Brampton wins
    assert svc._nearest_freshpro((43.74, -79.70)) is bram_scraper
    # No coords → fallback to first scraper
    assert svc._nearest_freshpro(None) is rh_scraper
