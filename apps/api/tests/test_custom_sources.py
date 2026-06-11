"""FreshPro 自定义抓取器单元测试。"""

import json
from flipp.custom_sources import FreshProScraper, FRESHPRO_STORES

# 测试用门店元数据（不依赖真实 URL）
FAKE_STORE = {
    "name": "FreshPro Foodmart",
    "flyer_id": "freshpro:test",
    "flyer_urls": [
        "https://example.com/flyer.jpg",
        "https://example.com/flyer-back.jpg",
    ],
    "coords": (43.8801, -79.4369),
    "address": "Test Location, ON",
}


class FakeVisionLLM:
    def __init__(self, response=None, fail=False):
        self._available = True
        self.fail = fail
        self.calls = 0
        self._response = response or json.dumps([
            {"name": "DRAGON FRUIT", "price": 1.99, "price_text": "$1.99 ea"},
            {"name": "PORK BELLY 3KG", "price": 12.99, "price_text": "$12.99/kg"},
        ])

    def available(self):
        return self._available

    def complete_vision(self, prompt, image_urls):
        self.calls += 1
        if self.fail:
            raise Exception("vision failed")
        return self._response


class FakeCache:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return (self.store[key], False) if key in self.store else None

    def set(self, key, value):
        self.store[key] = value


def _make_scraper(llm=None, cache=None, store=None):
    return FreshProScraper(store or FAKE_STORE, llm or FakeVisionLLM(), cache or FakeCache())


def test_fetch_items_returns_structured_items():
    scraper = _make_scraper()
    items = scraper.fetch_items()
    assert len(items) == 2
    assert items[0]["name"] == "DRAGON FRUIT"
    assert items[0]["price"] == 1.99
    assert items[1]["name"] == "PORK BELLY 3KG"


def test_fetch_items_cached_on_success():
    cache = FakeCache()
    llm = FakeVisionLLM()
    scraper = _make_scraper(llm=llm, cache=cache)
    scraper.fetch_items()
    assert llm.calls == 1
    scraper.fetch_items()   # second call — should use cache
    assert llm.calls == 1


def test_fetch_items_returns_empty_on_llm_failure():
    scraper = _make_scraper(llm=FakeVisionLLM(fail=True))
    items = scraper.fetch_items()
    assert items == []


def test_fetch_items_skips_items_without_price():
    response = json.dumps([
        {"name": "APPLE"},                   # no price → skip
        {"name": "MANGO", "price": 0.99},    # valid
    ])
    scraper = _make_scraper(llm=FakeVisionLLM(response=response))
    items = scraper.fetch_items()
    assert len(items) == 1
    assert items[0]["name"] == "MANGO"


def test_cache_key_uses_flyer_id():
    """Cache key must be {flyer_id}:items so each store has its own cache slot."""
    cache = FakeCache()
    scraper = _make_scraper(cache=cache)
    scraper.fetch_items()
    assert "freshpro:test:items" in cache.store
    # Must NOT use old hardcoded key
    assert "freshpro:rh:items" not in cache.store


def test_freshpro_stores_metadata():
    assert len(FRESHPRO_STORES) == 3
    store_ids = {s["flyer_id"] for s in FRESHPRO_STORES}
    assert store_ids == {"freshpro:rh", "freshpro:brampton", "freshpro:mississauga"}
    for s in FRESHPRO_STORES:
        assert s["name"] == "FreshPro Foodmart"
        lat, lon = s["coords"]
        assert 43.0 < lat < 44.5   # all in Greater Toronto Area
        assert -80.5 < lon < -79.0
        assert len(s["flyer_urls"]) == 2
        assert s["address"]


def test_fetch_items_returns_empty_when_llm_unavailable():
    class UnavailableLLM:
        def available(self): return False
        def complete_vision(self, prompt, urls): raise AssertionError("should not be called")
    scraper = _make_scraper(llm=UnavailableLLM())
    assert scraper.fetch_items() == []


def test_fetch_items_returns_empty_on_malformed_response():
    class BadResponseLLM:
        def available(self): return True
        def complete_vision(self, prompt, urls): return "Sorry, I cannot parse this image."
    scraper = _make_scraper(llm=BadResponseLLM())
    assert scraper.fetch_items() == []


def test_fetch_items_returns_stale_on_llm_failure():
    """When cache is stale and LLM fails, return stale data instead of empty."""
    stale_items = [{"name": "APPLE", "price": 1.99, "price_text": "$1.99"}]

    class StaleCache:
        def __init__(self):
            # Key matches FAKE_STORE's flyer_id
            self.store = {"freshpro:test:items": stale_items}
        def get(self, key):
            if key in self.store:
                return (self.store[key], True)   # is_stale=True
            return None
        def set(self, key, value):
            self.store[key] = value

    scraper = _make_scraper(llm=FakeVisionLLM(fail=True), cache=StaleCache())
    result = scraper.fetch_items()
    assert result == stale_items
