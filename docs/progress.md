# Progress

Canonical task log. Mirrored in the project document (Grocery Flyer AI Recommender).

---

## 2026-06-05

### Decisions
- **TDR-001** Scope: Grocery-first, minimum-cost, category-extensible. Accepted.
- **TDR-002** Flipp acquisition: backend-only fetch, daily refresh, 24h cache. Accepted.
- **TDR-003** Cache store: SQLite / flat file (not PostgreSQL) for the MVP. Accepted.
- Backend language for the retrieval service: **Python** (zero runtime deps; aligns with the proven probe and the data-heavy Phase 4 work). Built as a lean standalone service under `apps/api`, deferring the heavy NestJS/Docker monorepo.

### Task 3.1 — Research Flipp Data Access — DONE (live-verified)
- Confirmed the `flyers-ng` endpoints, request format, and data shape.
- Live run for L3R0B1: HTTP 200, 62 grocery flyers, all nine target stores present, 473 priced items from one flyer. PASS.
- Deliverable: `flipp_feasibility_test.py`, research notes in this repo.
- Findings feeding Phase 4: the Groceries tag is noisy (use a curated allow-list); flyers mix non-grocery items (filter in category assignment).

### Task 3.2 — Flyer Retrieval Service — DONE (also delivers Task 3.3 cache)
- `apps/api/flipp/`: client, curated store allow-list, SQLite 24h cache, and a
  cache-first service with retry, shape validation, and graceful degradation.
- CLI: `python -m flipp.cli <POSTAL_CODE> [--store NAME]`.
- 14 unit tests, all offline (network client mocked). All passing.
- Verified the CLI fails gracefully with a clear message when Flipp is unreachable.
- CLI result display is bilingual (Chinese primary, English in parentheses) so non-English-reading users can browse the output. Store and product names are left exactly as Flipp returns them.

### Task 4.2 / 4.3 — Normalize names + assign category — DONE (LLM enrichment)

**Decision:** chosen approach is an LLM that does category + Simplified Chinese name in one cached pass (Option B). A naive keyword categorizer was rejected after a demo showed substring misfires ("bunched"→bun→bakery, "watermelon"→water→beverage).

- `apps/api/flipp/enrich.py`: batched, cached LLM enrichment. For each item it
  returns category (mapped locally to emoji + Chinese label), a Simplified
  Chinese name (brands kept/transliterated), and an is_grocery flag.
- Cost control: each unique product name is translated once and cached forever;
  names are sent in batches. Default model `claude-haiku-4-5-20251001`.
- CLI `--store` now shows: emoji + Chinese category + Chinese name + English
  original + price, and filters out non-grocery items.
- Security: API key read from `ANTHROPIC_API_KEY`; never in code or argv. No key
  or API failure degrades gracefully to the plain English list.
- 7 new unit tests (LLM mocked), 21 total, all passing.

---

## 2026-06-08

### Decisions
- **TDR-004** Web 优先：先交付 Next.js 14 Web UI，移动端（Expo）推后。符合 TDR-003 简洁优先原则。
- **TDR-005** HTTP 层：FastAPI 包装现有 Python 服务，uvicorn 运行。保持 Python 单一语言栈。

### Task 5.1/5.2/5.3 — 推荐引擎 — DONE
- `apps/api/flipp/recommend.py`：`RecommendationEngine` 汇总所有超市传单，
  按品类找最低价超市（best_store），返回 `weekly_guide` + `shopping_route`。
- 非食品商品过滤，"other" 品类排除，deals 每品类最多 3 条。
- 购物路线按品类胜出数降序排列。
- 价格比较使用 `float()` 转换以防止字符串排序错误。
- 27 个单元测试，全部离线（service/enricher 注入），全部通过。

### HTTP API — DONE
- `apps/api/server.py`：FastAPI，3 个接口：
  - `GET /api/flyers?postal_code=`
  - `GET /api/flyer?store=&postal_code=`
  - `GET /api/recommendations?postal_code=`
- CORS 允许 localhost:3000，FlippError → 503，缺传单 → 404，参数缺失 → 422。
- DB 路径通过 `FLIPP_DB_PATH` 环境变量覆盖（绝对路径默认）。
- `apps/api/requirements.txt`：fastapi 0.111.0、uvicorn 0.29.0、httpx 0.27.0。
- 36 个单元测试（含全部 503 错误路径），全部通过。
- 启动：`cd apps/api && uvicorn server:app --reload --port 8000`

### Web UI — DONE
- `apps/web/`：Next.js 14 App Router + TypeScript strict + Tailwind CSS 3。
- 4 个页面（全部服务端组件，中文优先双语）：
  - `/` — 邮编输入（正则校验加拿大格式 A1A 1A1）
  - `/flyers` — 超市卡片网格 + 「本周推荐」入口
  - `/flyers/[store]` — 商品列表（emoji + 中文名 + 英文原名 + 价格）
  - `/recommendations` — 各品类最优惠 + 购物路线
- stale 数据显示橙色提示条；API 错误优雅降级显示中英双语错误信息。
- 无 LLM Key 时应用仍可运行（英文名降级，不崩溃）。
- 无障碍：label/input 用 htmlFor/id 关联，装饰性 emoji 加 `aria-hidden`。
- 启动：`cd apps/web && npm run dev`（需 API 服务先在 :8000 运行）

### 移动端 App — DONE（PR: feat/expo-mobile-app）

- `apps/mobile/`：Expo SDK 51 + Expo Router 3.5 + NativeWind v4，iOS + Android 双平台。
- 底部三 Tab：🏠 首页（邮编输入 + 格式校验）/ ⭐ 推荐（品类卡片 + Google Maps 导航）/ 🏪 超市（传单列表）。
- Stack 页传单详情：品类 chip 横向滚动筛选 + 商品列表（中文名 + 价格绿字 + 计价单位 /lb /bag 等）。
- 后端新增 `price_text` 字段（`_clean_item` or-chain），推荐引擎 deals 同步携带，Web 端不受影响。
- React Context 共享邮编全局状态；`parsePriceUnit()` 解析计价单位。
- 「导航 →」按钮：`Linking.openURL` 打开 `https://www.google.com/maps/search/{Store}+near+{PostalCode}`，无需 Maps SDK。
- useEffect 取消机制（cancelled flag）+ retryKey 重试模式，防止竞态条件。
- 10 个单元/组件测试（parsePriceUnit × 6 + PostalCodeInput × 4），全部通过。
- 后端测试：37 个，全部通过。

---

## Next（待办）
- （可选）生产部署：Fly.io / Railway（API）+ Vercel（Web）。
- （可选）价格历史：添加 PostgreSQL，追踪跨周价格变化。
- 升级 Next.js 至已修复安全漏洞的补丁版本（当前 14.2.3 有已知 CVE）。
