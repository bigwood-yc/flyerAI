"""Enricher — categorize/translate/filter logic, no network."""

import json
import re

from flipp.enrich import Enricher, LLMError


class FakeLLM:
    """Stand-in for the Anthropic client. Builds replies from a canned mapping."""
    def __init__(self, mapping=None, available=True, fail=False):
        # name -> (category, zh_name, is_grocery)
        self.mapping = mapping or {}
        self._available = available
        self.fail = fail
        self.calls = 0

    def available(self):
        return self._available

    def complete(self, prompt):
        self.calls += 1
        if self.fail:
            raise LLMError("boom")
        out = []
        for line in prompt.splitlines():
            m = re.match(r"\s*(\d+)\.\s+(.*)", line)
            if not m:
                continue
            idx, name = int(m.group(1)), m.group(2).strip()
            cat, zh, isg = self.mapping.get(name, ("pantry", "杂货", True))
            out.append({"i": idx, "category": cat, "zh_name": zh, "is_grocery": isg})
        return json.dumps(out)


class FakeCache:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return (self.store[key], False) if key in self.store else None

    def set(self, key, value):
        self.store[key] = value


MAPPING = {
    "BUNCHED SPINACH": ("produce", "散装菠菜", True),
    "POWERADE® BEVERAGES, 710 ML": ("pantry", "Powerade 运动饮料 710毫升", True),
    "CLAIROL XL ROOT TOUCH UP SPRAY": ("other", "Clairol 染发喷雾", False),
}


def test_categorize_and_translate():
    enr = Enricher(FakeLLM(MAPPING), FakeCache())
    out = enr.enrich(["BUNCHED SPINACH"])
    rec = out["BUNCHED SPINACH"]
    assert rec["category"] == "produce"
    assert rec["emoji"] == "🥬"
    assert rec["category_zh"] == "蔬果"
    assert rec["zh_name"] == "散装菠菜"
    assert rec["is_grocery"] is True
    assert rec["enriched"] is True


def test_non_grocery_flagged():
    enr = Enricher(FakeLLM(MAPPING), FakeCache())
    rec = enr.enrich(["CLAIROL XL ROOT TOUCH UP SPRAY"])["CLAIROL XL ROOT TOUCH UP SPRAY"]
    assert rec["is_grocery"] is False
    assert rec["emoji"] == "🚫"


def test_cache_avoids_second_call():
    llm = FakeLLM(MAPPING)
    cache = FakeCache()
    enr = Enricher(llm, cache)
    enr.enrich(["BUNCHED SPINACH"])
    assert llm.calls == 1
    enr.enrich(["BUNCHED SPINACH"])      # served from cache
    assert llm.calls == 1                 # no second model call


def test_graceful_fallback_when_unavailable():
    enr = Enricher(FakeLLM(available=False), FakeCache())
    rec = enr.enrich(["MYSTERY ITEM"])["MYSTERY ITEM"]
    assert rec["enriched"] is False
    assert rec["is_grocery"] is True      # not filtered out
    assert rec["zh_name"] == "MYSTERY ITEM"  # English kept


def test_fallback_is_not_cached_so_it_retries():
    cache = FakeCache()
    Enricher(FakeLLM(fail=True), cache).enrich(["ITEM"])   # API fails -> fallback
    assert "zh:ITEM" not in cache.store                    # nothing cached
    # Now the model works; the name should be enriched (not stuck on fallback).
    rec = Enricher(FakeLLM({"ITEM": ("dairy", "牛奶", True)}), cache).enrich(["ITEM"])["ITEM"]
    assert rec["enriched"] is True
    assert rec["zh_name"] == "牛奶"


def test_unknown_category_falls_back_to_other():
    enr = Enricher(FakeLLM({"WEIRD": ("nonsense", "怪东西", True)}), FakeCache())
    rec = enr.enrich(["WEIRD"])["WEIRD"]
    assert rec["category"] == "other"


def test_batching_makes_multiple_calls():
    names = ["A", "B", "C"]
    llm = FakeLLM({n: ("pantry", n, True) for n in names})
    enr = Enricher(llm, FakeCache(), batch_size=2)
    out = enr.enrich(names)
    assert set(out) == {"A", "B", "C"}
    assert llm.calls == 2                 # ceil(3 / 2)
