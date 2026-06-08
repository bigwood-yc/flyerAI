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


def _normalize_pc(postal_code: str) -> str:
    return (postal_code or "").replace(" ", "").upper()


def _clean_item(raw: dict, merchant: str, flyer_id) -> dict:
    """Map a raw Flipp item to the fields downstream phases need."""
    return {
        "merchant": merchant,
        "flyer_id": flyer_id,
        "name": raw.get("name", ""),
        "price": raw.get("price"),
        "valid_from": raw.get("valid_from"),
        "valid_to": raw.get("valid_to"),
    }


class FlyerRetrievalService:
    def __init__(self, client, cache):
        self.client = client
        self.cache = cache

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

        flyers, stale = self._cached_or_refresh(f"flyers:{pc}", refresh)
        return {"postal_code": pc, "stale": stale, "flyers": flyers}

    def get_flyer(self, store: str, postal_code: str):
        """
        The current grocery flyer for one store, with its priced items.
        Returns None if that store has no grocery flyer for this postal code.
        """
        listing = self.get_grocery_flyers(postal_code)
        match = next(
            (f for f in listing["flyers"]
             if stores._normalize(f["merchant"]) == stores._normalize(store)),
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
