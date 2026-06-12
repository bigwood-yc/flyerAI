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
    assert "geo2:" in k1
    assert "L4C" in k1


def test_cache_key_normalises_apostrophe():
    k1 = _cache_key("Tim Horton's", "L4C")
    k2 = _cache_key("Tim Hortons", "L4C")
    assert k1 == k2
