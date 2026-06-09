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

### Next.js 升级 — DONE

- `apps/web/package.json`：`next` 14.2.3 → 15.5.19，清除全部 HIGH 级 CVE。
- 修复三个页面因 Next.js 15 breaking change（`params`/`searchParams` 改为 `Promise<...>`）导致的构建失败：
  - `app/flyers/[store]/page.tsx`
  - `app/flyers/page.tsx`
  - `app/recommendations/page.tsx`
- 剩余 2 个 moderate 漏洞来自 Next.js 内部捆绑的 `postcss 8.4.31`，不可在项目层面修复，需等 Next.js 官方更新。项目自身 `postcss 8.5.15` 不受影响。

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

## 2026-06-09

### Auth + 用户日志系统 — DONE（PR: feat/auth-and-logging）

**架构：** Supabase 统一管理 Auth（邮件 OTP）、用户资料、搜索日志；FastAPI JWT 验证；Beta 白名单模式（BETA_MODE env 变量切换）。

**后端（FastAPI）**
- `apps/api/auth.py`：HS256 JWT 验证 + is_whitelisted 白名单检查（BETA_MODE=true 时生效），7 个单元测试全部通过。
- `apps/api/activity_log.py`：`log_search()` 写入 search_logs 表，fire-and-forget（异常静默），4 个单元测试全部通过。
- `apps/api/server.py`：3 个路由全部接入 `Depends(get_current_user)` + `log_search()`，计时 response_ms。
- `apps/api/conftest.py`：pytest 启动时设置虚拟 Supabase 环境变量。
- API 总测试数：48 个，全部通过。

**数据库（Supabase）**
- `supabase/migrations/001_auth_schema.sql`：`user_profiles` 表（phone/preferred_postal_code/is_whitelisted/onboarding_done）+ 触发器自动创建 profile 行 + 分离式 RLS（防止用户自升 is_whitelisted）；`search_logs` 表（user_id/postal_code/query_type/flyer_category/store_name/response_ms）+ 3 个分析索引。

**Web（Next.js 15）**
- `apps/web/lib/supabase/browser.ts` + `server.ts`：Supabase SSR 客户端（浏览器/服务端分离）。
- `apps/web/middleware.ts`：session 刷新 + 未登录重定向 /login；redirect 响应携带 Set-Cookie。
- `apps/web/app/login/page.tsx`：邮件 OTP 两步登录（发送验证码→验证→检查 onboarding_done）。
- `apps/web/app/onboarding/page.tsx`：填写常用邮编 + 手机号（均可选）。
- 已有 3 个页面（/flyers、/flyers/[store]、/recommendations）注入 session token 调用 FastAPI。
- `LogoutButton.tsx`：退出登录，错误处理，router.refresh() 先于 router.push()。

**移动端（Expo 51）**
- `apps/mobile/lib/supabase.ts`：AsyncStorage 持久化 session，detectSessionInUrl: false。
- `apps/mobile/lib/api.ts`：fetchJson 自动从 session 提取 access_token 注入 Authorization 头。
- `apps/mobile/app/login.tsx`：邮件 OTP 两步登录，KeyboardAvoidingView，try/catch/finally。
- `apps/mobile/app/onboarding.tsx`：常用邮编 + 手机号（均可选），DB 失败统一报错。
- `apps/mobile/app/_layout.tsx`：auth guard（undefined=加载中→null screen；null=未登录→/login；session=已登录）。
- 移动端测试：10 个，全部通过。

**安全加固（审查发现并修复）**
- RLS 分拆 FOR ALL → SELECT + UPDATE with WITH CHECK（防止 is_whitelisted 自升）。
- search_logs FK 添加 ON DELETE CASCADE（防账号删除阻塞）。
- BETA_MODE 在函数调用时读取（非模块级），避免测试隔离问题。
- 中间件 redirect 响应携带完整 Set-Cookie（防 token 丢失）。
- sendOtp / verifyOtp / complete() 全部包裹 try/catch/finally（防 UI 冻结）。

---

## Next（待办）
- **【下一步】** 在 Supabase Dashboard 执行 `supabase/migrations/001_auth_schema.sql` 并填写各 `.env` 文件的真实 Supabase 密钥。
- （可选）生产部署：Fly.io / Railway（API）+ Vercel（Web）。
- （可选）价格历史：添加 PostgreSQL，追踪跨周价格变化。
