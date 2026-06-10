"""Recommendation engine — Phase 5. No network."""

from flipp.enrich import CATEGORIES
from flipp.recommend import RecommendationEngine


class FakeSvc:
    def __init__(self, flyers, flyer_map):
        self._flyers = flyers
        self._flyer_map = flyer_map

    def get_grocery_flyers(self, postal_code):
        return {"postal_code": postal_code, "stale": False, "flyers": self._flyers}

    def get_flyer(self, store, postal_code):
        return self._flyer_map.get(store)


class FakeEnricher:
    def __init__(self, mapping):
        self._mapping = mapping

    def enrich(self, names):
        return {n: self._mapping[n] for n in names if n in self._mapping}


def _item(name, price, store, price_text=""):
    return {"name": name, "price": price, "price_text": price_text,
            "valid_from": None, "valid_to": None, "merchant": store, "flyer_id": 1}


def _flyer(store, items):
    return {"store": store, "stale": False, "items": items}


def _enr(cat, zh, is_grocery=True):
    emoji, cat_zh = CATEGORIES.get(cat, ("🛒", "商品"))
    return {"category": cat, "emoji": emoji, "category_zh": cat_zh,
            "zh_name": zh, "is_grocery": is_grocery, "enriched": True}


def test_best_store_per_category_is_lowest_price():
    flyers = [{"id": 1, "merchant": "A"}, {"id": 2, "merchant": "B"}]
    flyer_map = {
        "A": _flyer("A", [_item("SPINACH", 3.0, "A")]),
        "B": _flyer("B", [_item("KALE", 2.0, "B")]),
    }
    enr_map = {
        "SPINACH": _enr("produce", "菠菜"),
        "KALE":    _enr("produce", "羽衣甘蓝"),
    }
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L3R0B1")

    assert result["postal_code"] == "L3R0B1"
    produce = next(g for g in result["weekly_guide"] if g["category"] == "produce")
    assert produce["best_store"] == "B"


def test_shopping_route_ordered_by_category_wins():
    flyers = [{"id": 1, "merchant": "A"}, {"id": 2, "merchant": "B"}]
    flyer_map = {
        "A": _flyer("A", [_item("BEEF", 5.0, "A"), _item("MILK", 3.0, "A")]),
        "B": _flyer("B", [_item("SPINACH", 2.0, "B")]),
    }
    enr_map = {
        "BEEF":   _enr("meat", "牛肉"),
        "MILK":   _enr("dairy", "牛奶"),
        "SPINACH": _enr("produce", "菠菜"),
    }
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L3R0B1")
    assert result["shopping_route"][0] == "A"  # A wins 2 categories


def test_missing_flyer_is_skipped():
    flyers = [{"id": 1, "merchant": "A"}, {"id": 2, "merchant": "Ghost"}]
    flyer_map = {"A": _flyer("A", [_item("MILK", 4.0, "A")])}
    enr_map = {"MILK": _enr("dairy", "牛奶")}
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L3R0B1")
    dairy = next(g for g in result["weekly_guide"] if g["category"] == "dairy")
    assert dairy["best_store"] == "A"


def test_non_grocery_items_excluded():
    flyers = [{"id": 1, "merchant": "A"}]
    flyer_map = {"A": _flyer("A", [_item("SHAMPOO", 5.0, "A"), _item("BEEF", 8.0, "A")])}
    enr_map = {
        "SHAMPOO": _enr("other", "洗发水", is_grocery=False),
        "BEEF":    _enr("meat", "牛肉"),
    }
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L3R0B1")
    cats = [g["category"] for g in result["weekly_guide"]]
    assert "other" not in cats
    assert "meat" in cats


def test_each_category_block_has_max_three_deals():
    flyers = [{"id": 1, "merchant": "A"}]
    items = [_item(f"VEG{i}", float(i), "A") for i in range(1, 6)]
    flyer_map = {"A": _flyer("A", items)}
    enr_map = {f"VEG{i}": _enr("produce", f"蔬菜{i}") for i in range(1, 6)}
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L3R0B1")
    produce = next(g for g in result["weekly_guide"] if g["category"] == "produce")
    assert len(produce["deals"]) == 3


def test_empty_flyers_returns_empty_guide():
    engine = RecommendationEngine(FakeSvc([], {}), FakeEnricher({}))
    result = engine.generate("L3R0B1")
    assert result["weekly_guide"] == []
    assert result["shopping_route"] == []


def test_store_filter_limits_to_selected_stores():
    """With store_filter=["A"], only store A's items appear in the guide."""
    flyers = [{"id": 1, "merchant": "A"}, {"id": 2, "merchant": "B"}]
    flyer_map = {
        "A": _flyer("A", [_item("SPINACH", 1.0, "A")]),
        "B": _flyer("B", [_item("KALE", 0.5, "B")]),
    }
    enr_map = {
        "SPINACH": _enr("produce", "菠菜"),
        "KALE":    _enr("produce", "羽衣甘蓝"),
    }
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L4C0E6", store_filter=["A"])

    produce = next(g for g in result["weekly_guide"] if g["category"] == "produce")
    # B has cheaper item but is filtered out; A's item must be the best_store
    assert produce["best_store"] == "A"
    assert all(d["store"] == "A" for d in produce["deals"])


def test_store_filter_none_uses_all_stores():
    """store_filter=None must behave identically to calling with no filter."""
    flyers = [{"id": 1, "merchant": "A"}]
    flyer_map = {"A": _flyer("A", [_item("MILK", 3.0, "A")])}
    enr_map = {"MILK": _enr("dairy", "牛奶")}
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L4C0E6", store_filter=None)
    assert len(result["weekly_guide"]) > 0


def test_store_filter_empty_list_returns_empty_guide():
    """Filtering to zero stores must return an empty weekly_guide."""
    flyers = [{"id": 1, "merchant": "A"}]
    flyer_map = {"A": _flyer("A", [_item("MILK", 3.0, "A")])}
    enr_map = {"MILK": _enr("dairy", "牛奶")}
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    result = engine.generate("L4C0E6", store_filter=[])
    assert result["weekly_guide"] == []
    assert result["shopping_route"] == []


def test_store_filter_matches_case_insensitively():
    """store_filter matching must be case-insensitive and whitespace-tolerant."""
    flyers = [{"id": 1, "merchant": "No Frills"}, {"id": 2, "merchant": "FreshCo"}]
    flyer_map = {
        "No Frills": _flyer("No Frills", [_item("MILK", 2.0, "No Frills")]),
        "FreshCo":   _flyer("FreshCo",   [_item("EGGS", 3.0, "FreshCo")]),
    }
    enr_map = {
        "MILK": _enr("dairy", "牛奶"),
        "EGGS": _enr("dairy", "鸡蛋"),
    }
    engine = RecommendationEngine(FakeSvc(flyers, flyer_map), FakeEnricher(enr_map))
    # Filter with different casing and extra whitespace — must still match
    result = engine.generate("L4C0E6", store_filter=["  no frills  "])
    dairy = next(g for g in result["weekly_guide"] if g["category"] == "dairy")
    assert dairy["best_store"] == "No Frills"
    # FreshCo must NOT appear
    assert all(d["store"] == "No Frills" for d in dairy["deals"])
