"""
Flyer Retrieval Service (Task 3.2).

Input:  postal code (and optionally a single store)
Output: current grocery flyers / a store's current flyer with priced items

Design (per TDR-002):
  - Read from cache first. If the entry is fresh (< 24h), serve it and make no
    network call.
  - On a cache miss or a stale entry, refresh from Flipp and update the cache.
  - If a refresh fails but a (possibly stale) cache entry exists, serve it with
    stale=True rather than failing. Only when there is no cache at all do we
    raise.

The client and cache are injected, so the orchestration is fully unit-testable
without touching the network.
"""

from . import stores
from .client import FlippError
from .geocode import postal_code_coords, store_coords_cached, haversine_km, kick_geocoding, format_store_address
from .custom_sources import FreshProScraper, FRESHPRO_RH


def _normalize_pc(postal_code: str) -> str:
    return (postal_code or "").replace(" ", "").upper()


def _clean_item(raw: dict, merchant: str, flyer_id) -> dict:
    """Map a raw Flipp item to the fields downstream phases need."""
    return {
        "merchant": merchant,
        "flyer_id": flyer_id,
        "name": raw.get("name", ""),
        "price": raw.get("price"),
        "price_text": (
            raw.get("current_price_text") or raw.get("price_text") or ""
        ),
        "valid_from": raw.get("valid_from"),
        "valid_to": raw.get("valid_to"),
    }


class FlyerRetrievalService:
    def __init__(self, client, cache, freshpro: "FreshProScraper | None" = None):
        self.client = client
        self.cache = cache
        self._freshpro = freshpro

    def _cached_or_refresh(self, key, refresh_fn):
        """
        Return (value, stale). Serve fresh cache without a network call; refresh
        on miss/stale; fall back to stale cache if the refresh fails.
        """
        cached = self.cache.get(key)
        if cached is not None and not cached[1]:  # present and fresh
            return cached[0], False
        try:
            value = refresh_fn()
            self.cache.set(key, value)
            return value, False
        except FlippError:
            if cached is not None:  # serve stale rather than nothing
                return cached[0], True
            raise

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
            addr: str | None = None
            if user_coords:
                sc = store_coords_cached(f["merchant"], fsa, self.cache)
                if sc is not None:
                    dist = round(
                        haversine_km(user_coords[0], user_coords[1], sc[0], sc[1]), 1
                    )
                    addr = format_store_address(sc)
                else:
                    needs_geocoding.append(f["merchant"])
            flyers_with_dist.append({**f, "distance_km": dist, "address": addr})

        # Background-geocode any uncached stores (fire-and-forget)
        if needs_geocoding:
            kick_geocoding(needs_geocoding, pc, self.cache)

        # Sort: known distances ascending, unknown last (preserving Flipp order among unknowns)
        known = [(f["distance_km"], i, f) for i, f in enumerate(flyers_with_dist) if f["distance_km"] is not None]
        unknown = [f for f in flyers_with_dist if f["distance_km"] is None]
        sorted_flyers = [f for _, _, f in sorted(known, key=lambda x: x[0])] + unknown

        # Inject custom sources (e.g. FreshPro) with hardcoded coords
        if self._freshpro is not None:
            fp_dist: float | None = None
            if user_coords:
                fp_lat, fp_lon = FRESHPRO_RH["coords"]
                fp_dist = round(haversine_km(user_coords[0], user_coords[1], fp_lat, fp_lon), 1)
            sorted_flyers.append({
                "id": FRESHPRO_RH["flyer_id"],
                "merchant": FRESHPRO_RH["name"],
                "distance_km": fp_dist,
                "address": FRESHPRO_RH["address"],
            })

        return {"postal_code": pc, "stale": stale, "flyers": sorted_flyers}

    def get_flyer(self, store: str, postal_code: str):
        """
        The current grocery flyer for one store, with its priced items.
        Returns None if that store has no grocery flyer for this postal code.
        """
        # Custom sources bypass Flipp — route directly to the scraper
        if self._freshpro is not None and stores.normalize(store) == stores.normalize(FRESHPRO_RH["name"]):
            items = self._freshpro.fetch_items()
            return {
                "store": FRESHPRO_RH["name"],
                "flyer_id": FRESHPRO_RH["flyer_id"],
                "stale": False,
                "items": items,
            }

        listing = self.get_grocery_flyers(postal_code)
        match = next(
            (f for f in listing["flyers"]
             if stores.normalize(f["merchant"]) == stores.normalize(store)),
            None,
        )
        if match is None:
            return None

        flyer_id = match["id"]
        merchant = match["merchant"]

        def refresh():
            raw_items = self.client.fetch_items(flyer_id)
            return [_clean_item(it, merchant, flyer_id) for it in raw_items]

        items, items_stale = self._cached_or_refresh(f"items:{flyer_id}", refresh)
        return {
            "store": merchant,
            "flyer_id": flyer_id,
            "stale": listing["stale"] or items_stale,
            "items": items,
        }
