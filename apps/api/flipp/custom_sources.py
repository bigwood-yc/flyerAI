"""
自定义超市来源 — 针对不在 Flipp 上的超市，通过官网图片传单提取商品。

当前支持：
  - FreshPro Foodmart, Richmond Hill（每周更新两张 JPEG 传单图片）

抓取流程：
  1. 将图片 URL 传给 Claude Vision API
  2. Claude 返回 JSON 数组（name, price, price_text）
  3. 结果缓存 4 天（传单每周更新，4 天确保及时刷新）
"""

from .enrich import _parse_json_array

# FreshPro Richmond Hill 店元数据
FRESHPRO_RH = {
    "name": "FreshPro Foodmart",
    "flyer_id": "freshpro:rh",            # 非 Flipp flyer_id，用字符串区分
    "flyer_urls": [
        "https://freshprofoodmart.com/images/flyer-richmond.jpg",
        "https://freshprofoodmart.com/images/flyer-richmond-back.jpg",
    ],
    "coords": (43.8801, -79.4369),         # 9625 Yonge St, Richmond Hill, ON
    "address": "9625 Yonge St, Richmond Hill, ON",
}

_EXTRACT_PROMPT = (
    "This is a Canadian grocery store weekly flyer image (FreshPro Foodmart, Richmond Hill, ON). "
    "Extract every product that has a visible price. "
    "Return a JSON array where each element is:\n"
    '  {"name": "product name in English as shown", "price": 1.99, "price_text": "$1.99 ea"}\n'
    "Rules:\n"
    "  - price must be a numeric float (e.g. 2.99, not '$2.99')\n"
    "  - if price is shown as 'X for $Y', set price to Y/X rounded to 2 decimals\n"
    "  - include size/weight in the name if shown (e.g. 'PORK BELLY 3KG')\n"
    "  - skip any item without a clearly visible price\n"
    "Respond with ONLY the JSON array, no prose, no markdown code fences."
)


class FreshProScraper:
    CACHE_KEY = "freshpro:rh:items"

    def __init__(self, llm_client, cache):
        """
        llm_client: must have available() -> bool and complete_vision(prompt, urls) -> str.
        cache: SqliteCache instance; must be constructed with ttl=4*24*3600 (4 days) by caller.
        """
        self.llm = llm_client
        self.cache = cache

    def fetch_items(self) -> list[dict]:
        """
        返回 FreshPro 本周特价列表。每个元素：{name, price, price_text}。
        结果缓存 4 天（由调用方在 SqliteCache 构造时设置 TTL）。
        缓存过期时若 LLM 提取失败，返回旧缓存数据；无缓存时返回空列表。
        """
        cached = self.cache.get(self.CACHE_KEY)
        stale_value = cached[0] if cached is not None else None
        if cached is not None and not cached[1]:   # fresh
            return cached[0]
        items = self._extract_from_flyer()
        if items:
            self.cache.set(self.CACHE_KEY, items)
            return items
        # LLM failed — serve stale data if available
        return stale_value if stale_value is not None else []

    def _extract_from_flyer(self) -> list[dict]:
        if not (hasattr(self.llm, "available") and self.llm.available()):
            return []
        try:
            raw = self.llm.complete_vision(_EXTRACT_PROMPT, FRESHPRO_RH["flyer_urls"])
        except Exception as exc:
            print(f"[freshpro] vision extraction failed: {exc}", flush=True)
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
