#!/usr/bin/env python3
"""
Flipp Flyer Data — Feasibility Test
====================================
Purpose: Verify whether grocery flyer data can be retrieved live from Flipp,
         for a given Canadian postal code, with ZERO external dependencies
         (Python 3 standard library only).

Usage:
    python3 flipp_feasibility_test.py            # uses default Markham postal code
    python3 flipp_feasibility_test.py M5V3L9     # test a specific postal code

A run is a PASS if it lists grocery flyers AND pulls priced items from one of them.
"""

import json
import random
import ssl
import sys
import urllib.parse
import urllib.request

# --- Confirmed Flipp internal endpoints (flyers-ng family) ---
FLYERS_URL = "https://flyers-ng.flippback.com/api/flipp/data?locale=en&postal_code={pc}&sid={sid}"
ITEMS_URL = "https://flyers-ng.flippback.com/api/flipp/flyers/{fid}/flyer_items?locale=en&sid={sid}"

# A browser-like UA reduces the chance of being filtered as a bot.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
}

TIMEOUT = 15  # seconds


def new_sid() -> str:
    """Flipp expects a 16-digit session id; any random one works."""
    return "".join(str(random.randint(0, 9)) for _ in range(16))


def get_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def is_grocery(flyer: dict) -> bool:
    cats = flyer.get("categories", []) or []
    if isinstance(cats, str):
        cats = [c.strip() for c in cats.split(",")]
    return "Groceries" in cats


def main():
    postal = (sys.argv[1] if len(sys.argv) > 1 else "L3R0B1").replace(" ", "").upper()
    print(f"\n=== Flipp feasibility test — postal code: {postal} ===\n")

    # 1) Fetch the flyer list for this postal code
    try:
        status, data = get_json(FLYERS_URL.format(pc=postal, sid=new_sid()))
    except Exception as e:
        print(f"[FAIL] Could not reach the flyers endpoint: {e}")
        print("       -> Network/DNS issue, or endpoint moved. Test is INCONCLUSIVE.")
        sys.exit(2)

    flyers = data.get("flyers", []) if isinstance(data, dict) else []
    print(f"HTTP {status} — {len(flyers)} flyers returned for this postal code.")
    if not flyers:
        print("[FAIL] Endpoint reachable but returned no flyers. Try another postal code.")
        sys.exit(1)

    grocery = [f for f in flyers if is_grocery(f)]
    print(f"Grocery flyers found: {len(grocery)}")
    merchants = sorted({f.get("merchant", "?") for f in grocery})
    print("Grocery merchants available here:", ", ".join(merchants) or "(none)")

    if not grocery:
        print("\n[PARTIAL] Flyers retrieved, but none tagged 'Groceries'.")
        print("          API works; grocery coverage varies by postal code.")
        sys.exit(0)

    # 2) Pull items from the first grocery flyer to confirm priced data
    fid = grocery[0]["id"]
    merchant = grocery[0].get("merchant", "?")
    print(f"\nFetching items from first grocery flyer: {merchant} (id={fid}) ...")
    try:
        _, items = get_json(ITEMS_URL.format(fid=fid, sid=new_sid()))
    except Exception as e:
        print(f"[FAIL] Flyer list works but item fetch failed: {e}")
        sys.exit(1)

    items = items if isinstance(items, list) else []
    priced = [it for it in items if it.get("price") not in (None, "")]
    print(f"Items in flyer: {len(items)} | with a price: {len(priced)}")

    for it in priced[:5]:
        print(f"   - {it.get('name', '?')[:55]:55}  ${it.get('price')}")

    print()
    if priced:
        print(f"[PASS] Live grocery price data retrieved from Flipp for {postal}.")
    else:
        print("[PARTIAL] Flyer items returned but without prices. Inspect raw item shape.")


if __name__ == "__main__":
    main()
