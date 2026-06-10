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

The geo: cache entries use a 10-year TTL because store locations almost never change.
"""

import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request

import pgeocode

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_UA = f"GroceryFlyerAI/1.0 (contact: {os.environ.get('ADMIN_EMAIL', 'zhou.yuchen1990@gmail.com')})"
_NOMINATIM_DELAY = 1.1   # seconds between requests (OSM policy: 1/sec)
_nominatim_sem = threading.Semaphore(1)  # global rate limiter: 1 concurrent Nominatim call
_GEOCODE_TTL = 10 * 365 * 24 * 60 * 60   # 10 years; store locations rarely change

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
        lat = float(row.latitude)
        lon = float(row.longitude)
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
    """Call OSM Nominatim; returns (lat, lon) or None. Holds _nominatim_sem."""
    url = (
        _NOMINATIM_URL
        + "?q=" + urllib.parse.quote(query)
        + "&format=json&limit=1&countrycodes=ca"
    )
    req = urllib.request.Request(url, headers={"User-Agent": _NOMINATIM_UA})
    with _nominatim_sem:
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                result = (float(data[0]["lat"]), float(data[0]["lon"])) if data else None
        except Exception:
            result = None
        time.sleep(_NOMINATIM_DELAY)   # rate limit enforced inside the semaphore
        return result


def kick_geocoding(
    merchants: list[str], postal_code: str, cache
) -> None:
    """
    Start a background daemon thread to geocode uncached merchants.
    Merchants already in cache (even failed ones) are skipped.
    The passed cache is used directly — SqliteCache has a threading.Lock so
    sharing it across threads is safe.
    """
    fsa = postal_code[:3].upper()
    to_geocode = [
        m for m in merchants
        if cache.get(_cache_key(m, fsa)) is None
    ]
    if not to_geocode:
        return

    def _worker() -> None:
        for merchant in to_geocode:
            key = _cache_key(merchant, fsa)
            coords = _nominatim_search(f"{merchant} grocery {fsa} Canada")
            cache.set(key, coords)

    threading.Thread(target=_worker, daemon=True).start()
