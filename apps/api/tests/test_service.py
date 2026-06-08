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
         "current_price_text": "$2.50 / bag",   # 新增
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
    assert flyer["items"][0]["price_text"] == "$2.50 / bag"   # 新增


def test_get_flyer_none_for_unknown_store():
    svc = FlyerRetrievalService(FakeClient(flyers=SAMPLE_FLYERS), FakeCache())
    assert svc.get_flyer("Costco", "L3R0B1") is None
