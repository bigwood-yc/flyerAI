# UI + 推荐引擎实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 Python CLI 添加 FastAPI HTTP 层、推荐引擎，并搭建 Next.js 14 Web UI（中文优先双语）。

**Architecture:** FastAPI 包装已有的 `FlyerRetrievalService` + `Enricher`，暴露 3 个 REST 接口；Next.js App Router 通过 URL rewrite 代理 `/api/*` 到 FastAPI；推荐引擎汇总所有超市传单，按品类找最低价并生成购物路线。

**Tech Stack:** Python 3.11 + FastAPI + uvicorn；Next.js 14 + TypeScript + Tailwind CSS 3；SQLite 缓存（已有）

---

## 文件结构

```
apps/api/
  flipp/
    recommend.py          ← 新建：推荐引擎
  tests/
    test_recommend.py     ← 新建：推荐引擎测试
    test_server.py        ← 新建：FastAPI 接口测试
  server.py               ← 新建：FastAPI HTTP 入口
  requirements.txt        ← 新建：fastapi, uvicorn, httpx

apps/web/
  app/
    globals.css           ← 新建：Tailwind 基础样式
    layout.tsx            ← 新建：根布局
    page.tsx              ← 新建：首页（邮编输入）
    flyers/
      page.tsx            ← 新建：超市列表
      [store]/
        page.tsx          ← 新建：超市传单商品
    recommendations/
      page.tsx            ← 新建：本周推荐
  components/
    PostalCodeForm.tsx    ← 新建：邮编输入表单
    StoreCard.tsx         ← 新建：超市卡片
    ItemRow.tsx           ← 新建：商品行
    CategoryBlock.tsx     ← 新建：品类最优惠模块
  lib/
    api.ts                ← 新建：API 调用封装 + 类型
  package.json            ← 新建
  next.config.mjs         ← 新建：/api/* → localhost:8000 代理
  tailwind.config.ts      ← 新建
  postcss.config.mjs      ← 新建
  tsconfig.json           ← 新建
```

---

## Task 1：推荐引擎 `recommend.py`

**Files:**
- Create: `apps/api/flipp/recommend.py`
- Create: `apps/api/tests/test_recommend.py`

- [ ] **步骤 1：写测试（先让它失败）**

创建 `apps/api/tests/test_recommend.py`：

```python
"""Recommendation engine — Phase 5. No network."""

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


def _item(name, price, store):
    return {"name": name, "price": price, "valid_from": None, "valid_to": None,
            "merchant": store, "flyer_id": 1}


def _flyer(store, items):
    return {"store": store, "stale": False, "items": items}


def _enr(cat, zh, is_grocery=True):
    from flipp.enrich import CATEGORIES
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
    assert len(produce["deals"]) <= 3
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
cd apps/api
python -m pytest tests/test_recommend.py -v
```

预期：`ModuleNotFoundError: No module named 'flipp.recommend'`

- [ ] **步骤 3：实现 `recommend.py`**

创建 `apps/api/flipp/recommend.py`：

```python
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
            best_item = min(items, key=lambda x: x["price"])
            best_store = best_item["store"]
            store_items = sorted(
                [i for i in items if i["store"] == best_store],
                key=lambda x: x["price"],
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
```

- [ ] **步骤 4：运行测试，确认通过**

```bash
cd apps/api
python -m pytest tests/test_recommend.py -v
```

预期：5 个测试全部 PASS

- [ ] **步骤 5：运行全套测试，确认没有回归**

```bash
cd apps/api
python -m pytest tests/ -v
```

预期：全部 PASS（原有 21 个 + 新增 5 个 = 26 个）

- [ ] **步骤 6：提交**

```bash
cd apps/api
git add flipp/recommend.py tests/test_recommend.py
git commit -m "feat: add recommendation engine (Phase 5)

Aggregates enriched flyer data across all stores; produces per-category
best deal and shopping route ordered by win count.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2：FastAPI HTTP 层

**Files:**
- Create: `apps/api/requirements.txt`
- Create: `apps/api/server.py`
- Create: `apps/api/tests/test_server.py`

- [ ] **步骤 1：创建 `requirements.txt`**

创建 `apps/api/requirements.txt`：

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
httpx==0.27.0
pytest==8.2.0
```

- [ ] **步骤 2：安装依赖**

```bash
cd apps/api
pip install -r requirements.txt
```

预期：无报错

- [ ] **步骤 3：写测试**

创建 `apps/api/tests/test_server.py`：

```python
"""FastAPI HTTP layer — unit tests. Service and enricher are mocked."""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from server import app

client = TestClient(app)

MOCK_FLYERS_RESP = {
    "postal_code": "L3R0B1", "stale": False,
    "flyers": [{"id": 1, "merchant": "Walmart"}],
}
MOCK_FLYER_RESP = {
    "store": "Walmart", "stale": False,
    "items": [{"name": "SPINACH", "price": 2.5, "valid_from": None,
               "valid_to": None, "merchant": "Walmart", "flyer_id": 1}],
}
MOCK_ENR = {
    "SPINACH": {
        "category": "produce", "emoji": "🥬", "category_zh": "蔬果",
        "zh_name": "菠菜", "is_grocery": True, "enriched": True,
    }
}
MOCK_RECO = {
    "postal_code": "L3R0B1",
    "weekly_guide": [{"category": "produce", "emoji": "🥬", "category_zh": "蔬果",
                      "best_store": "Walmart", "deals": []}],
    "shopping_route": ["Walmart"],
}


def test_get_flyers_ok():
    with patch("server._make_service") as m:
        m.return_value.get_grocery_flyers.return_value = MOCK_FLYERS_RESP
        resp = client.get("/api/flyers?postal_code=L3R0B1")
    assert resp.status_code == 200
    assert resp.json()["flyers"][0]["merchant"] == "Walmart"


def test_get_flyers_missing_postal_code_returns_422():
    resp = client.get("/api/flyers")
    assert resp.status_code == 422


def test_get_flyer_ok_returns_enriched_items():
    with patch("server._make_service") as ms, patch("server._make_enricher") as me:
        ms.return_value.get_flyer.return_value = MOCK_FLYER_RESP
        me.return_value.enrich.return_value = MOCK_ENR
        resp = client.get("/api/flyer?store=Walmart&postal_code=L3R0B1")
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["zh_name"] == "菠菜"
    assert item["emoji"] == "🥬"
    assert item["price"] == 2.5


def test_get_flyer_not_found_returns_404():
    with patch("server._make_service") as ms, patch("server._make_enricher"):
        ms.return_value.get_flyer.return_value = None
        resp = client.get("/api/flyer?store=Unknown&postal_code=L3R0B1")
    assert resp.status_code == 404


def test_get_recommendations_ok():
    with patch("server.RecommendationEngine") as MockEng:
        MockEng.return_value.generate.return_value = MOCK_RECO
        resp = client.get("/api/recommendations?postal_code=L3R0B1")
    assert resp.status_code == 200
    body = resp.json()
    assert "weekly_guide" in body
    assert "shopping_route" in body


def test_get_recommendations_missing_postal_code_returns_422():
    resp = client.get("/api/recommendations")
    assert resp.status_code == 422
```

- [ ] **步骤 4：运行测试，确认失败**

```bash
cd apps/api
python -m pytest tests/test_server.py -v
```

预期：`ModuleNotFoundError: No module named 'server'`（或 `fastapi`）

- [ ] **步骤 5：实现 `server.py`**

创建 `apps/api/server.py`：

```python
"""
FastAPI HTTP server — wraps the existing Flipp service and enricher.

Run:  uvicorn server:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from flipp.client import FlippClient, FlippError
from flipp.cache import SqliteCache
from flipp.service import FlyerRetrievalService
from flipp.enrich import AnthropicClient, Enricher, STABLE_TTL
from flipp.recommend import RecommendationEngine

_DB = "flipp_cache.db"

app = FastAPI(title="Grocery Flyer AI API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _make_service() -> FlyerRetrievalService:
    return FlyerRetrievalService(FlippClient(), SqliteCache(_DB))


def _make_enricher() -> Enricher:
    return Enricher(AnthropicClient(), SqliteCache(_DB, ttl=STABLE_TTL))


@app.get("/api/flyers")
def get_flyers(postal_code: str = Query(..., min_length=5)):
    svc = _make_service()
    try:
        return svc.get_grocery_flyers(postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/flyer")
def get_flyer(
    store: str = Query(...),
    postal_code: str = Query(..., min_length=5),
):
    svc = _make_service()
    enricher = _make_enricher()
    try:
        flyer = svc.get_flyer(store, postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if flyer is None:
        raise HTTPException(status_code=404, detail="No flyer found for this store")

    priced = [i for i in flyer["items"] if i["price"] not in (None, "")]
    enr = enricher.enrich([it["name"] for it in priced])
    enriched_items = [
        {
            "name": it["name"],
            "price": it["price"],
            "category": enr[it["name"]]["category"],
            "emoji": enr[it["name"]]["emoji"],
            "category_zh": enr[it["name"]]["category_zh"],
            "zh_name": enr[it["name"]]["zh_name"],
            "is_grocery": enr[it["name"]]["is_grocery"],
        }
        for it in priced
    ]
    return {"store": flyer["store"], "stale": flyer["stale"], "items": enriched_items}


@app.get("/api/recommendations")
def get_recommendations(postal_code: str = Query(..., min_length=5)):
    engine = RecommendationEngine(_make_service(), _make_enricher())
    try:
        return engine.generate(postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
```

- [ ] **步骤 6：运行测试，确认通过**

```bash
cd apps/api
python -m pytest tests/test_server.py -v
```

预期：6 个测试全部 PASS

- [ ] **步骤 7：手动验证服务器启动**

```bash
cd apps/api
uvicorn server:app --reload --port 8000
```

打开浏览器访问 `http://localhost:8000/docs`，确认看到 3 个接口文档。Ctrl+C 停止。

- [ ] **步骤 8：提交**

```bash
git add apps/api/requirements.txt apps/api/server.py apps/api/tests/test_server.py
git commit -m "feat: add FastAPI HTTP layer with 3 endpoints

Wraps FlyerRetrievalService + Enricher + RecommendationEngine.
CORS enabled for localhost:3000.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3：Next.js 项目脚手架

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/app/globals.css`

- [ ] **步骤 1：创建目录**

```bash
mkdir -p apps/web/app apps/web/components apps/web/lib
```

- [ ] **步骤 2：创建 `apps/web/package.json`**

```json
{
  "name": "flyer-ai-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10"
  }
}
```

- [ ] **步骤 3：创建 `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **步骤 4：创建 `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **步骤 5：创建 `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **步骤 6：创建 `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **步骤 7：创建 `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **步骤 8：安装依赖**

```bash
cd apps/web
npm install
```

预期：`node_modules/` 创建，无错误

- [ ] **步骤 9：提交**

```bash
git add apps/web/package.json apps/web/next.config.mjs apps/web/tailwind.config.ts
git add apps/web/postcss.config.mjs apps/web/tsconfig.json apps/web/app/globals.css
git commit -m "feat: scaffold Next.js 14 web app

Tailwind CSS, TypeScript, API rewrite to :8000.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4：API 类型 + 客户端

**Files:**
- Create: `apps/web/lib/api.ts`

- [ ] **步骤 1：创建 `apps/web/lib/api.ts`**

```typescript
// API 响应类型定义 + 调用封装
// 服务端组件直接访问 localhost:8000；浏览器走 Next.js rewrite 代理

export interface FlyerInfo {
  id: number;
  merchant: string;
}

export interface FlyersResponse {
  postal_code: string;
  stale: boolean;
  flyers: FlyerInfo[];
}

export interface FlyerItem {
  name: string;
  price: number;
  category: string;
  emoji: string;
  category_zh: string;
  zh_name: string;
  is_grocery: boolean;
}

export interface FlyerResponse {
  store: string;
  stale: boolean;
  items: FlyerItem[];
}

export interface Deal {
  name: string;
  zh_name: string;
  price: number;
  store: string;
  emoji: string;
  category_zh: string;
}

export interface CategoryGuide {
  category: string;
  emoji: string;
  category_zh: string;
  best_store: string;
  deals: Deal[];
}

export interface RecommendationsResponse {
  postal_code: string;
  weekly_guide: CategoryGuide[];
  shopping_route: string[];
}

// Server components fetch directly; browser calls go through Next.js rewrite
const API_BASE =
  typeof window === "undefined" ? "http://localhost:8000" : "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getFlyers(postalCode: string): Promise<FlyersResponse> {
  return fetchJson<FlyersResponse>(
    `/api/flyers?postal_code=${encodeURIComponent(postalCode)}`
  );
}

export function getFlyer(
  store: string,
  postalCode: string
): Promise<FlyerResponse> {
  return fetchJson<FlyerResponse>(
    `/api/flyer?store=${encodeURIComponent(store)}&postal_code=${encodeURIComponent(postalCode)}`
  );
}

export function getRecommendations(
  postalCode: string
): Promise<RecommendationsResponse> {
  return fetchJson<RecommendationsResponse>(
    `/api/recommendations?postal_code=${encodeURIComponent(postalCode)}`
  );
}
```

- [ ] **步骤 2：验证 TypeScript 无报错**

```bash
cd apps/web
npx tsc --noEmit
```

预期：无输出（0 错误）

- [ ] **步骤 3：提交**

```bash
git add apps/web/lib/api.ts
git commit -m "feat: add API client types and fetch helpers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5：根布局 + 首页

**Files:**
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/components/PostalCodeForm.tsx`
- Create: `apps/web/app/page.tsx`

- [ ] **步骤 1：创建 `apps/web/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "本周特价 / Grocery Deals",
  description: "加拿大杂货特价推荐 / Canadian Grocery Deals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto">
            <span className="text-xl font-bold">🛒 本周特价 / This Week's Deals</span>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **步骤 2：创建 `apps/web/components/PostalCodeForm.tsx`**

```typescript
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PostalCodeForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(trimmed)) {
      setError("请输入有效的加拿大邮编，例如 L3R 0B1");
      return;
    }
    setError("");
    const pc = trimmed.replace(/\s/g, "").toUpperCase();
    router.push(`/flyers?postal_code=${pc}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm text-gray-600">
        邮政编码 / Postal Code
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="例如 L3R 0B1"
          maxLength={7}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded-lg
                     hover:bg-blue-700 active:bg-blue-800 font-medium"
        >
          查找
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
```

- [ ] **步骤 3：创建 `apps/web/app/page.tsx`**

```typescript
import PostalCodeForm from "@/components/PostalCodeForm";

export default function HomePage() {
  return (
    <div className="space-y-8 pt-4">
      <div>
        <h2 className="text-2xl font-bold mb-1">查找附近特价</h2>
        <p className="text-gray-500 text-sm">Find the best grocery deals near you</p>
      </div>
      <PostalCodeForm />
    </div>
  );
}
```

- [ ] **步骤 4：启动开发服务器，验证首页**

```bash
# 终端 1 — 启动 API（如果还没启动）
cd apps/api
uvicorn server:app --reload --port 8000

# 终端 2 — 启动 Web
cd apps/web
npm run dev
```

打开 `http://localhost:3000`，确认：
- 页头显示「🛒 本周特价 / This Week's Deals」
- 邮编输入框可见
- 输入 `abc` 点查找 → 显示红色错误提示
- 输入 `L3R0B1` 点查找 → 跳转 `/flyers?postal_code=L3R0B1`（页面暂无内容是正常的）

- [ ] **步骤 5：提交**

```bash
git add apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/components/PostalCodeForm.tsx
git commit -m "feat: add root layout and home page with postal code form

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6：传单列表页

**Files:**
- Create: `apps/web/components/StoreCard.tsx`
- Create: `apps/web/app/flyers/page.tsx`

- [ ] **步骤 1：创建 `apps/web/components/StoreCard.tsx`**

```typescript
import Link from "next/link";

interface Props {
  merchant: string;
  postalCode: string;
}

export default function StoreCard({ merchant, postalCode }: Props) {
  const href = `/flyers/${encodeURIComponent(merchant)}?postal_code=${postalCode}`;
  return (
    <Link href={href}>
      <div className="bg-white border border-gray-200 rounded-xl p-4
                      hover:shadow-md hover:border-blue-400 transition cursor-pointer">
        <div className="text-lg font-semibold">{merchant}</div>
        <div className="text-sm text-blue-600 mt-1">查看传单 →</div>
      </div>
    </Link>
  );
}
```

- [ ] **步骤 2：创建 `apps/web/app/flyers/page.tsx`**

```typescript
import Link from "next/link";
import StoreCard from "@/components/StoreCard";
import { getFlyers } from "@/lib/api";

interface Props {
  searchParams: { postal_code?: string };
}

export default async function FlyersPage({ searchParams }: Props) {
  const pc = searchParams.postal_code ?? "";

  if (!pc) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">请先输入邮编 / Please enter a postal code</p>
        <Link href="/" className="text-blue-600 underline">返回首页</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getFlyers(pc);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyers
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">邮编 {data.postal_code} 的传单</h2>
          <p className="text-sm text-gray-500">
            共 {data.flyers.length} 家超市 / {data.flyers.length} stores
          </p>
        </div>
        <Link
          href={`/recommendations?postal_code=${pc}`}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
        >
          本周推荐 →
        </Link>
      </div>

      {data.stale && (
        <p className="text-orange-600 text-sm bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新 / Served from cache, may not be current
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.flyers.map((f) => (
          <StoreCard key={f.id} merchant={f.merchant} postalCode={pc} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：验证页面**

确保 `uvicorn server:app --reload --port 8000` 仍在运行（需要真实 Flipp 数据或测试可用缓存）。

打开 `http://localhost:3000/flyers?postal_code=L3R0B1`，确认：
- 显示超市卡片网格
- 「本周推荐 →」按钮可见
- 点击超市卡片 → 跳转到 `/flyers/[store]`（下一 Task 实现）

- [ ] **步骤 4：提交**

```bash
git add apps/web/components/StoreCard.tsx apps/web/app/flyers/page.tsx
git commit -m "feat: add flyers list page with store cards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7：超市传单详情页

**Files:**
- Create: `apps/web/components/ItemRow.tsx`
- Create: `apps/web/app/flyers/[store]/page.tsx`

- [ ] **步骤 1：创建 `apps/web/components/ItemRow.tsx`**

```typescript
import type { FlyerItem } from "@/lib/api";

interface Props {
  item: FlyerItem;
}

export default function ItemRow({ item }: Props) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className="text-2xl w-8 text-center flex-shrink-0">{item.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.zh_name}</div>
        <div className="text-xs text-gray-400 truncate">{item.name}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-bold text-green-700">${item.price.toFixed(2)}</div>
        <div className="text-xs text-gray-400">{item.category_zh}</div>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：创建 `apps/web/app/flyers/[store]/page.tsx`**

```typescript
import Link from "next/link";
import ItemRow from "@/components/ItemRow";
import { getFlyer } from "@/lib/api";

interface Props {
  params: { store: string };
  searchParams: { postal_code?: string };
}

export default async function StoreFlyerPage({ params, searchParams }: Props) {
  const store = decodeURIComponent(params.store);
  const pc = searchParams.postal_code ?? "";

  let data;
  try {
    data = await getFlyer(store, pc);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("404")) {
      return (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-500">该超市暂无传单 / No flyer available</p>
          <Link href={`/flyers?postal_code=${pc}`} className="text-blue-600 underline">
            返回列表
          </Link>
        </div>
      );
    }
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyer
      </div>
    );
  }

  const groceries = data.items.filter((i) => i.is_grocery);
  const filtered = data.items.length - groceries.length;

  return (
    <div className="space-y-4">
      <Link
        href={`/flyers?postal_code=${pc}`}
        className="text-blue-600 text-sm inline-block"
      >
        ← 返回列表
      </Link>

      <div>
        <h2 className="text-xl font-bold">{data.store}</h2>
        <p className="text-sm text-gray-500">
          共 {groceries.length} 个特价商品 / {groceries.length} priced items
        </p>
      </div>

      {data.stale && (
        <p className="text-orange-600 text-sm bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新 / Served from cache, may not be current
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 px-4">
        {groceries.length === 0 ? (
          <p className="py-8 text-center text-gray-400">暂无商品数据</p>
        ) : (
          groceries.map((item, i) => <ItemRow key={i} item={item} />)
        )}
      </div>

      {filtered > 0 && (
        <p className="text-sm text-gray-400 text-center">
          已过滤 {filtered} 个非食品商品 / filtered {filtered} non-grocery items
        </p>
      )}
    </div>
  );
}
```

- [ ] **步骤 3：验证页面**

打开 `http://localhost:3000/flyers/Walmart?postal_code=L3R0B1`，确认：
- 商品列表显示（emoji + 中文名 + 英文原名 + 价格）
- 「← 返回列表」可点击
- 非食品已过滤

- [ ] **步骤 4：提交**

```bash
git add apps/web/components/ItemRow.tsx "apps/web/app/flyers/[store]/page.tsx"
git commit -m "feat: add store flyer detail page with enriched items

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8：推荐页

**Files:**
- Create: `apps/web/components/CategoryBlock.tsx`
- Create: `apps/web/app/recommendations/page.tsx`

- [ ] **步骤 1：创建 `apps/web/components/CategoryBlock.tsx`**

```typescript
import type { CategoryGuide } from "@/lib/api";

interface Props {
  guide: CategoryGuide;
}

export default function CategoryBlock({ guide }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-xl">{guide.emoji}</span>
        <div>
          <span className="font-semibold">{guide.category_zh}</span>
          <span className="text-sm text-gray-400 ml-2">
            最优：{guide.best_store}
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {guide.deals.map((deal, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{deal.zh_name}</div>
              <div className="text-xs text-gray-400 truncate">{deal.store}</div>
            </div>
            <div className="font-bold text-green-700 flex-shrink-0">
              ${deal.price.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：创建 `apps/web/app/recommendations/page.tsx`**

```typescript
import Link from "next/link";
import CategoryBlock from "@/components/CategoryBlock";
import { getRecommendations } from "@/lib/api";

interface Props {
  searchParams: { postal_code?: string };
}

export default async function RecommendationsPage({ searchParams }: Props) {
  const pc = searchParams.postal_code ?? "";

  if (!pc) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">请先输入邮编 / Please enter a postal code</p>
        <Link href="/" className="text-blue-600 underline">返回首页</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getRecommendations(pc);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法生成推荐，请稍后重试 / Could not generate recommendations
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">本周最优惠</h2>
        <p className="text-sm text-gray-500">
          This Week's Best Deals · {data.postal_code}
        </p>
      </div>

      {data.shopping_route.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="text-sm font-semibold text-blue-800 mb-1">
            🗺 建议购物路线 / Shopping Route
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {data.shopping_route.map((store, i) => (
              <span key={store} className="text-blue-700 text-sm">
                {i + 1}. {store}
                {i < data.shopping_route.length - 1 ? " →" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.weekly_guide.length === 0 ? (
        <p className="text-gray-400 text-center py-8">暂无推荐数据 / No data available</p>
      ) : (
        <div className="space-y-4">
          {data.weekly_guide.map((guide) => (
            <CategoryBlock key={guide.category} guide={guide} />
          ))}
        </div>
      )}

      <div className="text-center pt-2">
        <Link
          href={`/flyers?postal_code=${pc}`}
          className="text-blue-600 text-sm underline"
        >
          查看各超市传单 / Browse all flyers
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：端对端验证完整流程**

确保 API 服务器在 `:8000` 运行，且设置了 `ANTHROPIC_API_KEY`。

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Windows: $env:ANTHROPIC_API_KEY="sk-ant-..."
```

访问 `http://localhost:3000`，执行以下验证清单：

1. **首页**：输入 `L3R0B1`，点「查找」→ 跳转传单列表
2. **传单列表**：看到超市卡片；点「本周推荐」→ 跳转推荐页
3. **超市传单**：点任意超市卡片 → 看到 emoji + 中文名 + 价格列表
4. **推荐页**：看到品类模块（蔬果/肉类/海鲜…）和购物路线
5. **无邮编**：直接访问 `/flyers` → 显示「请先输入邮编」提示
6. **无效邮编**：输入 `123` → 红色错误提示

- [ ] **步骤 4：提交**

```bash
git add apps/web/components/CategoryBlock.tsx apps/web/app/recommendations/page.tsx
git commit -m "feat: add recommendations page with category blocks and shopping route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 完成标准（Definition of Done）

- [ ] `python -m pytest tests/ -v` 全部 PASS（≥ 26 个测试）
- [ ] `uvicorn server:app --port 8000` 启动无报错，`/docs` 可访问
- [ ] `npm run dev` 启动无报错
- [ ] 首页 → 传单列表 → 超市详情 → 推荐页，全流程可用
- [ ] 非食品商品已过滤（有 `ANTHROPIC_API_KEY` 时）
- [ ] 无 API Key 时，应用仍可运行（降级为英文名，不崩溃）
- [ ] stale 数据显示橙色提示条
