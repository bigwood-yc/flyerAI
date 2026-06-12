"""
自定义超市来源 — 针对不在 Flipp 上的超市，通过官网图片传单提取商品。

当前支持：
  - FreshPro Foodmart（Richmond Hill、Brampton、Mississauga 三家门店）
    每店各有两张每周更新的 JPEG 传单图片

抓取流程：
  1. 将图片 URL 传给 Claude Vision API
  2. Claude 返回 JSON 数组（name, price, price_text）
  3. 结果按门店分别缓存 4 天（传单每周更新，4 天确保及时刷新）
"""

from .enrich import _parse_json_array

# FreshPro 所有门店元数据（用于距离计算和传单抓取）
FRESHPRO_STORES = [
    {
        "name": "FreshPro Foodmart",
        "flyer_id": "freshpro:rh",
        "flyer_urls": [
            "https://freshprofoodmart.com/images/flyer-richmond.jpg",
            "https://freshprofoodmart.com/images/flyer-richmond-back.jpg",
        ],
        "coords": (43.9028, -79.4410),
        "address": "10488 Yonge St, Richmond Hill, ON",
    },
    {
        "name": "FreshPro Foodmart",
        "flyer_id": "freshpro:brampton",
        "flyer_urls": [
            "https://freshprofoodmart.com/images/flyer-brampton.jpg",
            "https://freshprofoodmart.com/images/flyer-brampton-back.jpg",
        ],
        "coords": (43.7378, -79.6963),
        "address": "9125 Airport Rd, Brampton, ON",
    },
    {
        "name": "FreshPro Foodmart",
        "flyer_id": "freshpro:mississauga",
        "flyer_urls": [
            "https://freshprofoodmart.com/images/flyer-mississauga.jpg",
            "https://freshprofoodmart.com/images/flyer-mississauga-back.jpg",
        ],
        "coords": (43.7291, -79.6345),
        "address": "7333 Goreway Dr, Mississauga, ON",
    },
]

# TODO: remove once service.py migrates to FRESHPRO_STORES
FRESHPRO_RH = FRESHPRO_STORES[0]

_EXTRACT_PROMPT = (
    "This is a Canadian grocery store weekly flyer image (FreshPro Foodmart, {address}). "
    "Extract every product that has a visible price. "
    "Return a JSON array where each element is:\n"
    '  {{"name": "product name in English as shown", "price": 1.99, "price_text": "$1.99/lb"}}\n'
    "Rules:\n"
    "  - price must be a numeric float (e.g. 2.99, not '$2.99')\n"
    "  - if price is shown as 'X for $Y', set price to Y/X rounded to 2 decimals\n"
    "  - include size/weight in the name if shown (e.g. 'PORK BELLY 3KG')\n"
    "  - price_text: reproduce the price as printed, and include a unit ONLY if the flyer "
    "actually shows one next to that price. Use '$X.XX/lb' or '$X.XX/kg' ONLY for items "
    "priced by weight on the flyer (typically produce, meat, seafood). For packaged or "
    "each-priced items, use just '$X.XX' with no unit. Never invent '/lb' — if no unit is "
    "printed, do not add one.\n"
    "  - skip any item without a clearly visible price\n"
    "Respond with ONLY the JSON array, no prose, no markdown code fences."
)


class FreshProScraper:
    def __init__(self, store_meta: dict, llm_client, cache):
        """
        store_meta: one entry from FRESHPRO_STORES.
        llm_client: must have available() -> bool and complete_vision(prompt, urls) -> str.
        cache: SqliteCache instance; must be constructed with ttl=4*24*3600 (4 days) by caller.
        """
        self.store = store_meta
        self.llm = llm_client
        self.cache = cache
        self._cache_key = f"{store_meta['flyer_id']}:items"

    def fetch_items(self) -> list[dict]:
        """
        返回该门店本周特价列表。每个元素：{name, price, price_text}。
        结果缓存 4 天（由调用方在 SqliteCache 构造时设置 TTL）。
        缓存过期时若 LLM 提取失败，返回旧缓存数据；无缓存时返回空列表。
        """
        cached = self.cache.get(self._cache_key)
        stale_value = cached[0] if cached is not None else None
        if cached is not None and not cached[1]:   # fresh
            return cached[0]
        items = self._extract_from_flyer()
        if items:
            self.cache.set(self._cache_key, items)
            return items
        return stale_value if stale_value is not None else []

    def _extract_from_flyer(self) -> list[dict]:
        if not (hasattr(self.llm, "available") and self.llm.available()):
            return []
        prompt = _EXTRACT_PROMPT.format(address=self.store["address"])
        try:
            raw = self.llm.complete_vision(prompt, self.store["flyer_urls"])
        except Exception as exc:
            print(f"[{self.store['flyer_id']}] vision extraction failed: {exc}", flush=True)
            return []
        result = []
        for it in _parse_json_array(raw):
            if not isinstance(it, dict):
                continue
            name = (it.get("name") or "").strip()
            price = it.get("price")
            if not name or price is None:
                continue
            try:
                price = round(float(price), 2)
            except (TypeError, ValueError):
                continue
            result.append({
                "name": name,
                "price": price,
                "price_text": it.get("price_text") or f"${price:.2f}",
            })
        return result
