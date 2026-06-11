"""FreshPro 自定义抓取器单元测试。"""

import json
from flipp.custom_sources import FreshProScraper, FRESHPRO_RH


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


def test_fetch_items_returns_structured_items():
    scraper = FreshProScraper(FakeVisionLLM(), FakeCache())
    items = scraper.fetch_items()
    assert len(items) == 2
    assert items[0]["name"] == "DRAGON FRUIT"
    assert items[0]["price"] == 1.99
    assert items[1]["name"] == "PORK BELLY 3KG"


def test_fetch_items_cached_on_success():
    cache = FakeCache()
    llm = FakeVisionLLM()
    scraper = FreshProScraper(llm, cache)
    scraper.fetch_items()
    assert llm.calls == 1
    scraper.fetch_items()   # second call — should use cache
    assert llm.calls == 1


def test_fetch_items_returns_empty_on_llm_failure():
    scraper = FreshProScraper(FakeVisionLLM(fail=True), FakeCache())
    items = scraper.fetch_items()
    assert items == []


def test_fetch_items_skips_items_without_price():
    response = json.dumps([
        {"name": "APPLE"},                           # no price → skip
        {"name": "MANGO", "price": 0.99},            # valid
    ])
    scraper = FreshProScraper(FakeVisionLLM(response=response), FakeCache())
    items = scraper.fetch_items()
    assert len(items) == 1
    assert items[0]["name"] == "MANGO"


def test_freshpro_rh_metadata():
    assert FRESHPRO_RH["name"] == "FreshPro Foodmart"
    assert "coords" in FRESHPRO_RH
    lat, lon = FRESHPRO_RH["coords"]
    assert 43.0 < lat < 44.5   # Richmond Hill, ON
    assert -80.0 < lon < -79.0


def test_fetch_items_returns_empty_when_llm_unavailable():
    """available() returns False → fetch_items returns []."""
    class UnavailableLLM:
        def available(self): return False
        def complete_vision(self, prompt, urls): raise AssertionError("should not be called")
    scraper = FreshProScraper(UnavailableLLM(), FakeCache())
    assert scraper.fetch_items() == []


def test_fetch_items_returns_empty_on_malformed_response():
    """LLM returns text with no JSON array → fetch_items returns []."""
    class BadResponseLLM:
        def available(self): return True
        def complete_vision(self, prompt, urls): return "Sorry, I cannot parse this image."
    scraper = FreshProScraper(BadResponseLLM(), FakeCache())
    assert scraper.fetch_items() == []


def test_fetch_items_returns_stale_on_llm_failure():
    """When cache is stale and LLM fails, return stale data instead of empty."""
    stale_items = [{"name": "APPLE", "price": 1.99, "price_text": "$1.99"}]

    class StaleCache:
        def __init__(self):
            self.store = {"freshpro:rh:items": stale_items}
        def get(self, key):
            if key in self.store:
                return (self.store[key], True)   # is_stale=True
            return None
        def set(self, key, value):
            self.store[key] = value

    scraper = FreshProScraper(FakeVisionLLM(fail=True), StaleCache())
    result = scraper.fetch_items()
    assert result == stale_items
