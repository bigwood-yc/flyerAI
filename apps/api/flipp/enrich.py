"""
Product enrichment (Phase 4): categorize each flyer item, translate its name to
Simplified Chinese, and flag non-grocery items so they can be filtered.

A large language model does the categorize + translate in one pass. Results are
cached per product name forever (a translation never changes), so each unique
name costs one model call exactly once. Names are sent in batches to keep cost
and latency low. Brand names are kept or transliterated, not force-translated.

Standard library only — the Anthropic client is a thin urllib wrapper, so there
is still no runtime dependency. The API key is read from the ANTHROPIC_API_KEY
environment variable; it is never written to code or passed on the command line.
"""

import json
import os
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# A translation is stable, so the enrichment cache effectively never expires.
STABLE_TTL = 10 * 365 * 24 * 60 * 60

# category -> (emoji, Chinese label). The model returns the category key from
# this fixed set; the emoji and label are mapped locally so they stay consistent.
CATEGORIES = {
    "produce": ("🥬", "蔬果"),
    "meat": ("🥩", "肉类"),
    "seafood": ("🦐", "海鲜"),
    "dairy": ("🥛", "乳制品"),
    "bakery": ("🍞", "烘焙"),
    "frozen": ("🧊", "冷冻"),
    "pantry": ("🥫", "罐装/杂货"),
    "other": ("🚫", "非食品"),
}
# Neutral record used when enrichment is unavailable: keep the English name and
# do NOT filter the item out (is_grocery=True), so the app still works.
_NEUTRAL = ("🛒", "商品")

_PROMPT = (
    "You translate Canadian grocery flyer product names into Simplified Chinese "
    "for shoppers who do not read English. For each numbered item, return:\n"
    "  - i: the item's number\n"
    "  - category: one of produce, meat, seafood, dairy, bakery, frozen, pantry, other\n"
    "  - is_grocery: false for non-food items (health & beauty, household, pet, "
    "electronics, etc.), true otherwise\n"
    "  - zh_name: a concise Simplified Chinese name. Rules:\n"
    "    • Translate ALL produce names to Chinese, including tropical/exotic fruits "
    "(Dragon Fruit→火龙果, Papaya→木瓜, Lychee→荔枝, Jackfruit→菠萝蜜, Guava→番石榴, "
    "Durian→榴莲, Passion Fruit→百香果, Mango→芒果, Starfruit→杨桃).\n"
    "    • For items prefixed with 'NO NAME', omit the prefix entirely and "
    "translate only the product name (e.g., 'NO NAME White Vinegar 4L' → '白醋 4升').\n"
    "    • Keep all other brand names in their original form or transliterate them.\n"
    "    • Include the size/weight if present.\n"
    "Respond with ONLY a JSON array, no prose and no markdown code fences.\n\n"
    "Items:\n"
)


class LLMError(Exception):
    """Raised when the language model cannot be reached or returns nothing."""


class AnthropicClient:
    URL = "https://api.anthropic.com/v1/messages"

    def __init__(self, model="claude-haiku-4-5-20251001", max_tokens=2000, timeout=30):
        self.model = os.environ.get("FLIPP_TRANSLATE_MODEL", model)
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.api_key = os.environ.get("ANTHROPIC_API_KEY")

    def available(self) -> bool:
        return bool(self.api_key)

    def complete(self, prompt: str) -> str:
        if not self.api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set")
        body = json.dumps({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }).encode("utf-8")
        req = urllib.request.Request(self.URL, data=body, headers={
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            raise LLMError(f"Anthropic API call failed: {e}")
        return "".join(
            b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
        )


def _parse_json_array(text: str):
    """Pull a JSON array out of the model's reply, tolerating fences/prose."""
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1 or end < start:
        return []
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []


def _neutral_record(name: str) -> dict:
    emoji, zh = _NEUTRAL
    return {
        "category": "pantry",
        "emoji": emoji,
        "category_zh": zh,
        "zh_name": name,
        "is_grocery": True,
        "enriched": False,
    }


class Enricher:
    def __init__(self, llm, cache, batch_size: int = 40):
        self.llm = llm
        self.cache = cache
        self.batch_size = batch_size

    def enrich(self, names) -> dict:
        """
        Map each product name to a record:
          {category, emoji, category_zh, zh_name, is_grocery, enriched}.
        Cached names are reused; uncached names are translated in batches.
        Successful results are cached; neutral fallbacks are not (so they are
        retried once the model becomes available again).
        """
        result, todo = {}, []
        for name in names:
            cached = self.cache.get(f"zh2:{name}")
            if cached is not None:
                result[name] = cached[0]
            else:
                todo.append(name)

        batches = [todo[i:i + self.batch_size] for i in range(0, len(todo), self.batch_size)]
        # Fire all Claude API calls concurrently (network I/O bound).
        # Cache writes happen in the main thread after futures complete — safe.
        max_workers = min(4, len(batches)) if batches else 1
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {pool.submit(self._call, batch): batch for batch in batches}
            for fut in as_completed(futures):
                batch = futures[fut]
                enriched = fut.result()
                for name in batch:
                    if name in enriched:
                        self.cache.set(f"zh2:{name}", enriched[name])
                        result[name] = enriched[name]
                    else:
                        result[name] = _neutral_record(name)  # not cached
        return result

    def _call(self, names) -> dict:
        if hasattr(self.llm, "available") and not self.llm.available():
            return {}
        prompt = _PROMPT + "\n".join(f"{i}. {n}" for i, n in enumerate(names))
        try:
            text = self.llm.complete(prompt)
        except LLMError as exc:
            print(f"[enrich] LLM call failed: {exc}", flush=True)
            return {}

        out = {}
        for obj in _parse_json_array(text):
            if not isinstance(obj, dict):
                continue
            idx = obj.get("i")
            if not isinstance(idx, int) or not (0 <= idx < len(names)):
                continue
            cat = obj.get("category", "other")
            if cat not in CATEGORIES:
                cat = "other"
            emoji, zh = CATEGORIES[cat]
            name = names[idx]
            zh_name = obj.get("zh_name") or name
            # Strip "NO NAME" prefix regardless of LLM case variations
            zh_name = re.sub(r"^no\s+name\s+", "", zh_name, flags=re.IGNORECASE).strip()
            if not zh_name:
                zh_name = name
            out[name] = {
                "category": cat,
                "emoji": emoji,
                "category_zh": zh,
                "zh_name": zh_name,
                "is_grocery": bool(obj.get("is_grocery", True)),
                "enriched": True,
            }
        return out
