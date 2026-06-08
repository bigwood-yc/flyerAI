# UI + 推荐引擎设计规范

**日期**: 2026-06-08  
**项目**: Grocery Flyer AI Recommender  
**状态**: 已批准

---

## 背景与现状

后端 Python 服务已完成（Phase 3 + 4）：
- Flipp API 数据抓取，SQLite 24小时缓存
- Claude LLM 中文分类 + 翻译，非食品过滤
- 仅有 CLI 入口，无 HTTP API，无 UI

待开发：HTTP API 服务器、Web UI、推荐引擎（Phase 5）。

---

## 架构

```
apps/web                    apps/api
────────────────────        ─────────────────────────────
Next.js 14 (App Router)     server.py  ← FastAPI HTTP 入口
TypeScript                  │
Tailwind CSS           ───► ├── flipp/service.py   (已有)
                            ├── flipp/enrich.py    (已有)
                            ├── flipp/cache.py     (已有)
                            └── flipp/recommend.py (新建)
                                     │
                                  SQLite (flipp_cache.db)
```

运行方式：
- API：`uvicorn server:app --port 8000`（在 `apps/api/` 下）
- Web：`npm run dev`（在 `apps/web/` 下），代理 `/api/*` 到 `:8000`

---

## 后端 HTTP API（apps/api/server.py）

### 技术选型
FastAPI + uvicorn。理由：Python 生态内，自带 OpenAPI 文档，类型提示友好，无需额外语言。

### 接口定义

#### `GET /api/flyers`
```
参数：postal_code (str)
响应：
{
  "postal_code": "L3R0B1",
  "stale": false,
  "flyers": [
    {"id": 123, "merchant": "Walmart"},
    ...
  ]
}
```

#### `GET /api/flyer`
```
参数：store (str), postal_code (str)
响应：
{
  "store": "Walmart",
  "stale": false,
  "items": [
    {
      "name": "BUNCHED SPINACH",
      "price": 2.5,
      "category": "produce",
      "emoji": "🥬",
      "category_zh": "蔬果",
      "zh_name": "散装菠菜",
      "is_grocery": true
    },
    ...
  ]
}
错误：404 当超市未找到
```

#### `GET /api/recommendations`
```
参数：postal_code (str)
响应：
{
  "postal_code": "L3R0B1",
  "weekly_guide": [
    {
      "category": "produce",
      "emoji": "🥬",
      "category_zh": "蔬果",
      "best_store": "No Frills",
      "deals": [
        {"name": "散装菠菜", "price": 2.5, "store": "No Frills"},
        ...
      ]
    },
    ...
  ],
  "shopping_route": ["No Frills", "T&T Supermarket", "Walmart"]
}
```

### CORS
允许 `http://localhost:3000`（开发）和生产域名。

### 错误处理
- Flipp 不可达 → 503，如有缓存则返回缓存数据（stale=true）
- 邮编无效或无传单 → 404
- LLM 不可用 → 降级：返回英文名，不过滤非食品

---

## Web UI（apps/web）

### 技术选型
Next.js 14（App Router）+ TypeScript + Tailwind CSS。

### 页面结构

```
/                        首页：邮编输入
/flyers                  传单列表：可用超市卡片
/flyers/[store]          超市传单：商品列表
/recommendations         推荐页：本周最优惠 + 购物路线
```

### 首页 `/`
- 标题：「本周特价 / This Week's Deals」
- 邮编输入框（格式验证：加拿大邮编 A1A 1A1）
- 「查找」按钮 → 跳转 `/flyers?postal_code=X`
- 加载状态：骨架屏

### 传单列表 `/flyers`
- 超市卡片网格（显示商店名称）
- 每张卡片可点击 → 跳转 `/flyers/[store]`
- 底部「查看本周推荐」按钮 → `/recommendations`

### 超市传单 `/flyers/[store]`
- 页头：商店名 + 商品数量
- 每行：`[emoji] [中文品类]  [中文名]（英文原名）  $[价格]`
- 若有过滤：显示「已过滤 N 个非食品商品」
- stale 提示：橙色提示条「数据来自缓存，可能不是最新」

### 推荐页 `/recommendations`
- 各品类最优惠模块（蔬果、肉类、海鲜…）
- 每个模块：最优超市 + top 3 商品
- 底部：购物路线（超市顺序建议）

### 国际化
中文优先双语：所有 UI 文字中文在前、英文括号内，与现有 CLI 风格一致。

### 样式原则
- 移动端优先，响应式布局
- 简洁实用，不过度设计
- Tailwind CSS utility-first

---

## 推荐引擎（apps/api/flipp/recommend.py）

### Task 5.1 — 按品类找最低价
- 拉取所有可用超市的传单（并行，带缓存）
- 按 `category` 分组商品
- 每个品类内找最低价商品

### Task 5.2 — 生成周报
- 输入：各品类最低价列表
- 输出：`weekly_guide`，每个品类给出最佳超市 + 代表商品

### Task 5.3 — 购物路线
- 统计每家超市的 best deal 数量
- 按数量降序排列 → `shopping_route`

### 降级策略
- 某家超市 Flipp 数据缺失 → 跳过该超市，不报错
- LLM 不可用 → 仍提供价格比较，但无中文名和品类过滤

---

## 目录结构（完成后）

```
apps/
  api/
    flipp/
      __init__.py
      cache.py
      client.py
      enrich.py
      recommend.py  ← 新建
      service.py
      stores.py
    tests/
      test_*.py
    server.py         ← 新建
    requirements.txt  ← 新建 (fastapi, uvicorn)
  web/
    app/
      page.tsx              ← 首页
      flyers/
        page.tsx            ← 传单列表
        [store]/
          page.tsx          ← 超市传单
      recommendations/
        page.tsx            ← 推荐页
    components/
      PostalCodeForm.tsx
      StoreCard.tsx
      ItemRow.tsx
      CategoryBlock.tsx
    lib/
      api.ts                ← API 调用封装
    package.json
    tailwind.config.ts
    next.config.ts
    tsconfig.json
docs/
  superpowers/
    specs/
      2026-06-08-ui-recommendation-design.md
```

---

## 不在本次范围内

- 移动端 iOS/Android（后续用 Expo 添加）
- 用户账号、登录
- 价格历史
- Docker / 生产部署
- 推送通知

---

## 实施顺序

1. `apps/api/server.py` — FastAPI HTTP 层
2. `apps/api/flipp/recommend.py` — 推荐引擎
3. `apps/web` — Next.js 项目脚手架 + 4 个页面
4. 联调测试
