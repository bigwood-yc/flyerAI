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
    """Normalised cache key for a (merchant, FSA) geocoding result.

    v2 (``geo2:``): switched from a free-text ``"{merchant} grocery {fsa} Canada"``
    query (which Nominatim returned nothing for) to a viewbox-bounded search, so
    old cached failures must not be reused.
    """
    normalised = merchant.lower().replace(" ", "").replace("&", "").replace("'", "")
    return f"geo4:{normalised}:{fsa.upper()}"


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


def _nominatim_search(
    merchant: str, viewbox: str | None = None, center: tuple | None = None
) -> tuple | None:
    """Call OSM Nominatim; returns (lat, lon, display_name) or None. Holds _nominatim_sem.

    A free-text query that bakes the FSA into the string (e.g. "No Frills grocery
    L4C Canada") matches nothing, so we search the bare merchant name constrained
    to a ``viewbox`` around the user's FSA centroid. Nominatim orders results by
    prominence, not distance, so when ``center`` is given we pull many candidates
    and keep the one geographically nearest to it (the prominent-but-far store
    would otherwise win).
    """
    url = (
        _NOMINATIM_URL
        + "?q=" + urllib.parse.quote(merchant)
        + "&format=json&limit=40&countrycodes=ca"
    )
    if viewbox:
        url += "&viewbox=" + viewbox + "&bounded=1"
    req = urllib.request.Request(url, headers={"User-Agent": _NOMINATIM_UA})
    with _nominatim_sem:
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
        except Exception:
            data = None
        time.sleep(_NOMINATIM_DELAY)   # rate limit enforced inside the semaphore

    if not data:
        return None
    if center is not None:
        best = min(
            data,
            key=lambda r: haversine_km(center[0], center[1], float(r["lat"]), float(r["lon"])),
        )
    else:
        best = data[0]
    return (float(best["lat"]), float(best["lon"]), best.get("display_name", ""))


_ADDR_SKIP = frozenset({
    "canada", "ontario", "british columbia", "alberta", "quebec", "manitoba",
    "saskatchewan", "nova scotia", "new brunswick", "prince edward island",
    "newfoundland and labrador", "northwest territories", "nunavut", "yukon",
})


def format_store_address(sc: tuple | None) -> str | None:
    """Extract a short 'Street, City' address from a cached geocode tuple.

    Handles both legacy 2-tuples (lat, lon) and new 3-tuples (lat, lon, display_name).
    """
    if not sc or len(sc) < 3:
        return None
    display_name = sc[2] if isinstance(sc[2], str) else ""
    if not display_name:
        return None
    parts = [p.strip() for p in display_name.split(",")]
    kept = [
        p for p in parts
        if p
        and p.lower() not in _ADDR_SKIP
        and "region" not in p.lower()
        and "municipality" not in p.lower()
        and "district" not in p.lower()
        and "county" not in p.lower()
    ]
    # Skip leading part if it has no digits (likely the store name, not a street address)
    if kept and not any(c.isdigit() for c in kept[0]):
        kept = kept[1:]
    if len(kept) >= 2:
        return f"{kept[0]}, {kept[1]}"
    return kept[0] if kept else None


def _geocode_full_postal(postal_code: str) -> tuple | None:
    """Precise (lat, lon) for a full 6-char Canadian postal code via Nominatim, or None.

    pgeocode only resolves the 3-char FSA centroid, which can sit several km from the
    actual address; Nominatim resolves the full code (e.g. 'L4C 0E6') precisely.
    """
    pc = postal_code.replace(" ", "").upper()
    spaced = f"{pc[:3]} {pc[3:]}" if len(pc) >= 6 else pc
    url = (
        _NOMINATIM_URL + "?q=" + urllib.parse.quote(spaced)
        + "&format=json&limit=1&countrycodes=ca"
    )
    req = urllib.request.Request(url, headers={"User-Agent": _NOMINATIM_UA})
    with _nominatim_sem:
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
        except Exception:
            data = None
        time.sleep(_NOMINATIM_DELAY)
    if not data:
        return None
    return (float(data[0]["lat"]), float(data[0]["lon"]))


def cached_user_coords(postal_code: str, cache) -> tuple[float, float] | None:
    """The user's location for distance math, WITHOUT a network call.

    Returns the precise full-postal-code coordinates once kick_geocoding has cached
    them; until then falls back to the offline FSA centroid so the first response is
    still instant (distances refine to precise on a later request).
    """
    pc = postal_code.replace(" ", "").upper()
    hit = cache.get(f"pcgeo:{pc}")
    if hit is not None and hit[0] is not None:
        return hit[0]
    return postal_code_coords(pc)


def kick_geocoding(
    merchants: list[str], postal_code: str, cache
) -> None:
    """
    Start a background daemon thread that, for this full postal code, (1) geocodes the
    precise user location and (2) geocodes each uncached merchant relative to it.
    Everything is keyed by the full postal code so distances and the chosen branch are
    measured from the user's actual address, not the FSA centre. Already-cached entries
    (even failed ones) are skipped. SqliteCache has a lock, so sharing it is safe.
    """
    pc = postal_code.replace(" ", "").upper()
    need_user = cache.get(f"pcgeo:{pc}") is None
    to_geocode = [m for m in merchants if cache.get(_cache_key(m, pc)) is None]
    if not to_geocode and not need_user:
        return

    def _worker() -> None:
        # 1. Resolve (and cache) the precise user location; fall back to FSA centroid.
        hit = cache.get(f"pcgeo:{pc}")
        if hit is None:
            center = _geocode_full_postal(pc) or postal_code_coords(pc)
            cache.set(f"pcgeo:{pc}", center)
        else:
            center = hit[0]
        if center is None:
            return  # cannot bound the search; leave uncached so a later request retries
        lat, lon = center
        d = 0.1  # ~11 km half-box: keeps candidates local so the nearest store wins
        viewbox = f"{lon - d},{lat + d},{lon + d},{lat - d}"
        for merchant in to_geocode:
            coords = _nominatim_search(merchant, viewbox, center=center)
            cache.set(_cache_key(merchant, pc), coords)

    threading.Thread(target=_worker, daemon=True).start()
