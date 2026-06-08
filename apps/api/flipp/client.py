"""
Thin HTTP client for Flipp's internal flyer API (flyers-ng family).

Endpoints (confirmed live, see /docs/flipp-research.md):
  - flyer list:  GET /api/flipp/data?locale=en&postal_code={pc}&sid={sid}
  - flyer items: GET /api/flipp/flyers/{flyer_id}/flyer_items?locale=en&sid={sid}

This is an undocumented, unofficial API. We keep request volume low, send a
realistic User-Agent, retry transient failures with backoff, and validate the
response shape so a changed payload surfaces a clear error instead of garbage.

Standard library only — no runtime dependencies.
"""

import json
import random
import time
import urllib.error
import urllib.request

BASE = "https://flyers-ng.flippback.com/api/flipp"
FLYERS_URL = BASE + "/data?locale=en&postal_code={pc}&sid={sid}"
ITEMS_URL = BASE + "/flyers/{fid}/flyer_items?locale=en&sid={sid}"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


class FlippError(Exception):
    """Raised when Flipp cannot be reached or returns an unexpected payload."""


def _new_sid() -> str:
    """Flipp accepts any random 16-digit session id."""
    return "".join(str(random.randint(0, 9)) for _ in range(16))


class FlippClient:
    def __init__(self, timeout: int = 15, retries: int = 3, backoff: float = 0.5):
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff

    def _get_json(self, url: str):
        last_err = None
        for attempt in range(self.retries):
            try:
                req = urllib.request.Request(url, headers=_HEADERS)
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last_err = e
                if attempt < self.retries - 1:
                    time.sleep(self.backoff * (2 ** attempt))
        raise FlippError(f"request failed after {self.retries} tries: {url} ({last_err})")

    def fetch_flyers(self, postal_code: str) -> list:
        """Return the raw list of flyer objects for a postal code."""
        data = self._get_json(FLYERS_URL.format(pc=postal_code, sid=_new_sid()))
        if not isinstance(data, dict) or "flyers" not in data:
            raise FlippError("unexpected flyers payload: missing 'flyers'")
        flyers = data["flyers"]
        if not isinstance(flyers, list):
            raise FlippError("unexpected flyers payload: 'flyers' is not a list")
        return flyers

    def fetch_items(self, flyer_id) -> list:
        """Return the raw list of item objects for one flyer."""
        items = self._get_json(ITEMS_URL.format(fid=flyer_id, sid=_new_sid()))
        if not isinstance(items, list):
            raise FlippError(f"unexpected items payload for flyer {flyer_id}")
        return items
