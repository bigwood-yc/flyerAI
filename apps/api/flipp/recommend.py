"""
Recommendation Engine (Phase 5).

Aggregates enriched flyer data across all available stores and produces:
  - weekly_guide: per-category best deal (lowest price) + top 3 items
  - shopping_route: stores ordered by number of categories they win
"""

from .enrich import CATEGORIES


class RecommendationEngine:
    def __init__(self, service, enricher):
        self.service = service
        self.enricher = enricher

    def generate(self, postal_code: str) -> dict:
        listing = self.service.get_grocery_flyers(postal_code)
        flyers = listing.get("flyers", [])

        # Collect priced grocery items per category across all stores
        # "other" is excluded: it maps to non-food items — those go in the is_grocery filter
        category_items: dict[str, list[dict]] = {
            cat: [] for cat in CATEGORIES if cat != "other"
        }

        for flyer_info in flyers:
            store = flyer_info["merchant"]
            flyer = self.service.get_flyer(store, postal_code)
            if flyer is None:
                continue
            priced = [i for i in flyer["items"] if i["price"] not in (None, "")]
            if not priced:
                continue
            enr = self.enricher.enrich([it["name"] for it in priced])
            for it in priced:
                e = enr.get(it["name"])
                if e is None or not e["is_grocery"]:
                    continue
                cat = e["category"]
                if cat in category_items:
                    category_items[cat].append({
                        "name": it["name"],
                        "zh_name": e["zh_name"],
                        "price": it["price"],
                        "price_text": it.get("price_text", ""),   # 新增
                        "store": store,
                        "emoji": e["emoji"],
                        "category_zh": e["category_zh"],
                    })

        weekly_guide = []
        store_wins: dict[str, int] = {}

        for cat, items in category_items.items():
            if not items:
                continue
            # Best store = the one with the single cheapest item in this category
            best_item = min(items, key=lambda x: float(x["price"]))
            best_store = best_item["store"]
            store_items = sorted(
                [i for i in items if i["store"] == best_store],
                key=lambda x: float(x["price"]),
            )
            emoji, cat_zh = CATEGORIES[cat]
            weekly_guide.append({
                "category": cat,
                "emoji": emoji,
                "category_zh": cat_zh,
                "best_store": best_store,
                "deals": store_items[:3],
            })
            store_wins[best_store] = store_wins.get(best_store, 0) + 1

        shopping_route = sorted(
            store_wins, key=lambda s: store_wins[s], reverse=True
        )

        return {
            "postal_code": postal_code,
            "weekly_guide": weekly_guide,
            "shopping_route": shopping_route,
        }
