# 新增超市来源：Longos / Freshway / FreshPro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在超市列表中新增 Longo's、Freshway、FreshPro Foodmart（Richmond Hill 店）三家超市，支持查看各家本周特价商品。

**Architecture:** 三条路径：(1) Longo's 和 Freshway 通过 Flipp API 获取（只需添加到白名单）；(2) FreshPro 官网仅提供图片传单，通过 Claude Vision API 从图片中提取商品数据，实现 `custom_sources.py` 新模块；(3) `FlyerRetrievalService` 注入自定义来源，对外接口不变。

**Tech Stack:** Python 3.11 / pytest / Anthropic Vision API (base64 images)

---

## File Map

| File | 改动 |
|------|------|
| `apps/api/flipp/stores.py` | 添加 Longo's 和 Freshway 到白名单（验证后） |
| `apps/api/flipp/enrich.py` | 为 `AnthropicClient` 添加 `complete_vision()` 方法 |
| `apps/api/flipp/custom_sources.py` | **新建**：FreshPro 图片传单抓取器 |
| `apps/api/flipp/service.py` | 注入 `FreshProScraper`，在超市列表和传单详情中支持 |
| `apps/api/server.py` | `_make_service()` 传入 vision LLM |
| `apps/api/tests/test_custom_sources.py` | **新建**：FreshPro 抓取器单元测试 |
| `apps/api/tests/test_service.py` | 添加自定义来源集成测试 |

---

## Task 1: 验证并添加 Longo's / Freshway 到 Flipp 白名单

**Files:**
- Modify: `apps/api/flipp/stores.py`

Flipp 白名单中只有 9 家超市，通过 CLI 列出当前 Flipp 返回的所有超市，从中确认 Longo's 和 Freshway 的确切 merchant 字符串。

- [ ] **Step 1: 查询 Flipp 真实商户名**

```bash
cd apps/api
python -c "
from flipp.client import FlippClient
import json
client = FlippClient()
data = client._get_json('https://flyers-ng.flippback.com/api/flipp/data?locale=en&postal_code=L3R0B1&sid=1234567890123456')
merchants = sorted({f.get('merchant','') for f in data.get('flyers',[])})
for m in merchants:
    print(m)
"
```

在输出中找 "Longo" 和 "Freshway" 相关条目，记录**完整精确字符串**（包括大小写和标点）。

常见格式示例：`Longo's`、`Freshway Foods`。

- [ ] **Step 2: 编写失败测试**

在 `apps/api/tests/test_stores.py` 末尾追加（使用 Step 1 中确认的实际字符串）：

```python
def test_longos_in_allow_list():
    assert stores.is_grocery_merchant("Longo's")

def test_freshway_in_allow_list():
    assert stores.is_grocery_merchant("Freshway Foods")   # 按 Step 1 实际结果调整
```

运行：

```bash
python -m pytest tests/test_stores.py::test_longos_in_allow_list tests/test_stores.py::test_freshway_in_allow_list -v
```

期望：FAIL（尚未添加到白名单）。

- [ ] **Step 3: 添加到白名单**

在 `apps/api/flipp/stores.py` 的 `GROCERY_MERCHANTS` 集合中，添加 Step 1 确认的字符串（**全部小写**）：

```python
GROCERY_MERCHANTS = {
    "no frills",
    "freshco",
    "food basics",
    "walmart",
    "real canadian superstore",
    "t&t supermarket",
    "bestco foodmart",
    "blue sky supermarket",
    "nations fresh foods",
    "longo's",          # ← 按 Step 1 实际字符串填写（小写）
    "freshway foods",   # ← 按 Step 1 实际字符串填写（小写）
}
```

注意：`normalize()` 函数会做 lower + collapse whitespace，所以这里填原始字符串的 lower 版本即可。

- [ ] **Step 4: 运行测试**

```bash
python -m pytest tests/test_stores.py -v
```

期望：所有测试 PASS。

- [ ] **Step 5: 端到端验证**

```bash
python -m flipp.cli L3R0B1
```

期望：输出中出现 "Longo's" 和 "Freshway Foods"（或实际名称）。

- [ ] **Step 6: Commit**

```bash
git add apps/api/flipp/stores.py apps/api/tests/test_stores.py
git commit -m "feat(api): add Longo's and Freshway to grocery merchant allow-list"
```

> **如果 Flipp 中未找到 Freshway：** 跳过该超市，在 commit message 中注明，后续可按 Task 2-4 的 FreshPro 模式补充自定义抓取器。

---

## Task 2: AnthropicClient 添加 Vision 支持

**Files:**
- Modify: `apps/api/flipp/enrich.py`

FreshPro 特价页面（https://freshprofoodmart.com/richmondhillspecial.html）展示的是 JPEG 图片传单而非结构化 HTML。唯一可行方案是将图片发送给 Claude Vision API 提取商品。这里扩展现有 `AnthropicClient` 添加图片支持。

- [ ] **Step 1: 编写失败测试**

在 `apps/api/tests/test_enrich.py` 末尾追加：

```python
def test_anthropic_client_has_complete_vision():
    """AnthropicClient 必须有 complete_vision 方法（只测接口，不发真实请求）。"""
    from flipp.enrich import AnthropicClient
    client = AnthropicClient()
    assert hasattr(client, "complete_vision")
    assert callable(client.complete_vision)
```

运行：`python -m pytest tests/test_enrich.py::test_anthropic_client_has_complete_vision -v`

期望：FAIL。

- [ ] **Step 2: 在 `enrich.py` 顶部添加 `base64` import**

在 `apps/api/flipp/enrich.py` 第 15 行（现有 import 块末尾）添加：

```python
import base64
```

- [ ] **Step 3: 在 `AnthropicClient` 中添加辅助函数和 `complete_vision` 方法**

在 `AnthropicClient` 类中（`complete()` 方法之后，第 91 行后）添加：

```python
    @staticmethod
    def _fetch_image_b64(url: str) -> tuple[str, str]:
        """下载图片，返回 (base64_data, media_type)。"""
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            media_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        return base64.b64encode(data).decode("utf-8"), media_type

    def complete_vision(self, prompt: str, image_urls: list[str]) -> str:
        """
        向 Claude 发送图片 + 文字 prompt，返回文字回复。
        image_urls: 公开可访问的图片 URL 列表（JPEG/PNG/GIF/WEBP）。
        """
        if not self.api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set")
        content: list[dict] = []
        for url in image_urls:
            b64, mt = self._fetch_image_b64(url)
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": mt, "data": b64},
            })
        content.append({"type": "text", "text": prompt})
        body = json.dumps({
            "model": self.model,
            "max_tokens": 4000,
            "messages": [{"role": "user", "content": content}],
        }).encode("utf-8")
        req = urllib.request.Request(self.URL, data=body, headers={
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            raise LLMError(f"Anthropic vision API call failed: {e}")
        return "".join(
            b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
        )
```

- [ ] **Step 4: 运行测试**

```bash
cd apps/api && python -m pytest tests/test_enrich.py -v
```

期望：所有测试 PASS（包含 `test_anthropic_client_has_complete_vision`）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/flipp/enrich.py apps/api/tests/test_enrich.py
git commit -m "feat(api): add vision support to AnthropicClient (complete_vision)"
```

---

## Task 3: FreshPro 自定义抓取器

**Files:**
- Create: `apps/api/flipp/custom_sources.py`
- Create: `apps/api/tests/test_custom_sources.py`

新建独立模块，负责通过 Claude Vision 从 FreshPro 图片传单中提取商品数据。硬编码 Richmond Hill 店坐标（43.8801°N, 79.4369°W）避免 geocoding 依赖。

- [ ] **Step 1: 编写失败测试**

新建 `apps/api/tests/test_custom_sources.py`：

```python
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
```

运行：

```bash
cd apps/api && python -m pytest tests/test_custom_sources.py -v
```

期望：全部 FAIL（`custom_sources` 模块不存在）。

- [ ] **Step 2: 创建 `custom_sources.py`**

新建 `apps/api/flipp/custom_sources.py`：

```python
"""
自定义超市来源 — 针对不在 Flipp 上的超市，通过官网图片传单提取商品。

当前支持：
  - FreshPro Foodmart, Richmond Hill（每周更新两张 JPEG 传单图片）

抓取流程：
  1. 将图片 URL 传给 Claude Vision API
  2. Claude 返回 JSON 数组（name, price, price_text）
  3. 结果缓存 4 天（传单每周更新，4 天确保及时刷新）
"""

import json

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
    CACHE_TTL = 4 * 24 * 3600  # 4 days

    def __init__(self, llm_client, cache):
        self.llm = llm_client
        self.cache = cache

    def fetch_items(self) -> list[dict]:
        """
        返回 FreshPro 本周特价列表。每个元素：{name, price, price_text}。
        结果缓存 4 天；LLM 不可用时返回空列表。
        """
        cached = self.cache.get(self.CACHE_KEY)
        if cached is not None and not cached[1]:
            return cached[0]
        items = self._extract_from_flyer()
        if items:
            self.cache.set(self.CACHE_KEY, items)
        return items

    def _extract_from_flyer(self) -> list[dict]:
        if not (hasattr(self.llm, "available") and self.llm.available()):
            return []
        try:
            raw = self.llm.complete_vision(_EXTRACT_PROMPT, FRESHPRO_RH["flyer_urls"])
        except Exception:
            return []
        start, end = raw.find("["), raw.rfind("]")
        if start == -1 or end < start:
            return []
        try:
            items = json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return []
        result = []
        for it in items:
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
```

- [ ] **Step 3: 运行测试**

```bash
cd apps/api && python -m pytest tests/test_custom_sources.py -v
```

期望：所有 5 个测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/api/flipp/custom_sources.py apps/api/tests/test_custom_sources.py
git commit -m "feat(api): add FreshPro custom scraper (Claude Vision)"
```

---

## Task 4: 将 FreshPro 集成到 FlyerRetrievalService

**Files:**
- Modify: `apps/api/flipp/service.py`
- Modify: `apps/api/server.py`
- Modify: `apps/api/tests/test_service.py`

让 `/api/flyers` 超市列表包含 FreshPro，让 `/api/flyer?store=FreshPro+Foodmart` 返回抓取到的商品。

- [ ] **Step 1: 编写失败测试**

在 `apps/api/tests/test_service.py` 末尾追加：

```python
from flipp.service import FlyerRetrievalService
from flipp.client import FlippError
from flipp.custom_sources import FRESHPRO_RH


class _FakeClient:
    def __init__(self):
        self._flyers = []
        self._items = []
    def fetch_flyers(self, pc): return self._flyers
    def fetch_items(self, fid): return self._items


class _FakeCache:
    def __init__(self): self.store = {}
    def get(self, key): return (self.store[key], False) if key in self.store else None
    def set(self, key, value): self.store[key] = value


class _FakeFreshProScraper:
    def __init__(self, items=None):
        self._items = items or [{"name": "DRAGON FRUIT", "price": 1.99, "price_text": "$1.99 ea"}]
    def fetch_items(self): return self._items


def _make_svc(scraper):
    svc = FlyerRetrievalService(_FakeClient(), _FakeCache(), freshpro=scraper)
    return svc


def test_flyers_list_includes_freshpro():
    result = _make_svc(_FakeFreshProScraper()).get_grocery_flyers("L3R0B1")
    merchants = [f["merchant"] for f in result["flyers"]]
    assert "FreshPro Foodmart" in merchants


def test_get_flyer_for_freshpro_returns_items():
    scraper = _FakeFreshProScraper([{"name": "DRAGON FRUIT", "price": 1.99, "price_text": "$1.99 ea"}])
    flyer = _make_svc(scraper).get_flyer("FreshPro Foodmart", "L3R0B1")
    assert flyer is not None
    assert flyer["store"] == "FreshPro Foodmart"
    assert len(flyer["items"]) == 1
    assert flyer["items"][0]["name"] == "DRAGON FRUIT"
```

运行：

```bash
cd apps/api && python -m pytest tests/test_service.py::test_flyers_list_includes_freshpro tests/test_service.py::test_get_flyer_for_freshpro_returns_items -v
```

期望：FAIL。

- [ ] **Step 2: 修改 `service.py` — import 和 `__init__`**

在 `apps/api/flipp/service.py` 顶部 import 块添加：

```python
from .custom_sources import FreshProScraper, FRESHPRO_RH
```

将 `FlyerRetrievalService.__init__` 修改为接受可选的 `freshpro` 参数：

```python
class FlyerRetrievalService:
    def __init__(self, client, cache, freshpro: "FreshProScraper | None" = None):
        self.client = client
        self.cache = cache
        self._freshpro = freshpro
```

- [ ] **Step 3: 修改 `get_grocery_flyers()` — 注入 FreshPro 到超市列表**

在 `get_grocery_flyers()` 中，排序完成后（`sorted_flyers` 建立之后）、`return` 之前，添加 FreshPro 注入：

```python
        # 注入自定义超市（如 FreshPro），硬编码坐标免于 geocoding 依赖
        if self._freshpro is not None:
            fp_dist: float | None = None
            if user_coords:
                fp_lat, fp_lon = FRESHPRO_RH["coords"]
                fp_dist = round(haversine_km(user_coords[0], user_coords[1], fp_lat, fp_lon), 1)
            sorted_flyers.append({
                "id": FRESHPRO_RH["flyer_id"],
                "merchant": FRESHPRO_RH["name"],
                "distance_km": fp_dist,
                "address": FRESHPRO_RH["address"],
            })

        return {"postal_code": pc, "stale": stale, "flyers": sorted_flyers}
```

- [ ] **Step 4: 修改 `get_flyer()` — FreshPro 走自定义路径**

在 `get_flyer()` 方法的最开头（`listing = self.get_grocery_flyers(...)` 之前）添加：

```python
    def get_flyer(self, store: str, postal_code: str):
        # 自定义来源：FreshPro 不走 Flipp 路径
        if self._freshpro is not None and stores.normalize(store) == stores.normalize(FRESHPRO_RH["name"]):
            items = self._freshpro.fetch_items()
            return {
                "store": FRESHPRO_RH["name"],
                "flyer_id": FRESHPRO_RH["flyer_id"],
                "stale": False,
                "items": items,
            }

        listing = self.get_grocery_flyers(postal_code)
        # ... 后续代码不变 ...
```

- [ ] **Step 5: 修改 `server.py` — `_make_service()` 传入 FreshPro scraper**

在 `apps/api/server.py` 中，修改 `_make_service()`：

```python
def _make_service() -> FlyerRetrievalService:
    from flipp.custom_sources import FreshProScraper
    scraper = FreshProScraper(AnthropicClient(), _FLYER_CACHE)
    return FlyerRetrievalService(FlippClient(), _FLYER_CACHE, freshpro=scraper)
```

同时在 `_make_service` 上方确认已 import `AnthropicClient`（已在现有 import 行中）。

- [ ] **Step 6: 运行所有测试**

```bash
cd apps/api && python -m pytest tests/ -v
```

期望：所有测试 PASS。

- [ ] **Step 7: 本地端到端验证**

```bash
cd apps/api
ANTHROPIC_API_KEY=<your_key> uvicorn server:app --reload --port 8000
```

在另一个终端：

```bash
# 获取超市列表，确认 FreshPro 出现
curl "http://localhost:8000/api/flyers?postal_code=L3R0B1" \
  -H "Authorization: Bearer <your_supabase_token>" | python -m json.tool | grep -A2 "FreshPro"

# 获取 FreshPro 传单（首次会调用 Claude Vision，需 30-60 秒）
curl "http://localhost:8000/api/flyer?store=FreshPro+Foodmart&postal_code=L3R0B1" \
  -H "Authorization: Bearer <your_supabase_token>" | python -m json.tool | head -40
```

期望：FreshPro 在超市列表中出现；传单返回从图片中提取的商品（英文名），后续经过 enricher 翻译为中文。

- [ ] **Step 8: Commit**

```bash
git add apps/api/flipp/service.py apps/api/server.py apps/api/tests/test_service.py
git commit -m "feat(api): integrate FreshPro custom source into FlyerRetrievalService"
```

---

## 部署注意事项

1. **Render 环境无变化**：`ANTHROPIC_API_KEY` 已设置，Vision 调用使用同一 key。
2. **FreshPro 图片大小**：每张 JPEG 约 500KB-2MB，base64 后约 700KB-2.7MB，在 Anthropic API 32MB 限制内。首次调用 Vision 耗时 30-90 秒，结果缓存 4 天后仅需缓存读取。
3. **Render 免费层磁盘**：SQLite 文件在 Render 重启/重部署时重置，FreshPro 缓存会重建（每次部署后首次访问触发 Vision 调用）。若希望持久化，考虑 Render 付费层或 Redis。
4. **若 Freshway 未在 Flipp 中找到**：与 FreshPro 类似，检查其官网是否提供图片传单，若是则按 Task 3-4 模式添加 `FreshwayScraper`。
