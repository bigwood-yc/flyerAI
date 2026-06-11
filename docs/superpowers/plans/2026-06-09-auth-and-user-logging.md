# Auth & User Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase-based email-OTP authentication, user profiles, and per-request search logging to the FastAPI backend, Next.js web app, and Expo mobile app — with a beta whitelist that can be toggled off for open registration.

**Architecture:** Supabase manages auth (email OTP), user profiles (`user_profiles` table), and search logs (`search_logs` table) in a single PostgreSQL instance. FastAPI validates Supabase JWTs on every request and writes a log row after each successful query. Next.js web uses `@supabase/ssr` for server-side session management; Expo mobile uses `@supabase/supabase-js` with AsyncStorage persistence. Beta mode is controlled by a single `BETA_MODE=true/false` env variable.

**Tech Stack:**
- Backend: `supabase-py >=2.3`, `PyJWT >=2.8` added to FastAPI
- Web: `@supabase/supabase-js`, `@supabase/ssr` added to Next.js 15
- Mobile: `@supabase/supabase-js`, `@react-native-async-storage/async-storage` added to Expo 51
- DB: Supabase PostgreSQL (hosted) — two new tables + trigger + RLS

---

## Confirmed Decisions

| Question | Answer |
|---|---|
| Whitelist management | Manual SQL: `UPDATE user_profiles SET is_whitelisted=true WHERE id='<uid>';` |
| Phone number | Optional field |
| Flyer category logging | `flyer_category TEXT DEFAULT 'groceries'` — extensible when new store types added |

---

## File Map

```
supabase/
  migrations/
    001_auth_schema.sql        NEW  DB schema (run in Supabase SQL editor)

apps/api/
  requirements.txt             MOD  add supabase, PyJWT
  auth.py                      NEW  JWT validation + whitelist FastAPI Dependency
  activity_log.py              NEW  log_search() writes to search_logs
  server.py                    MOD  add Depends(get_current_user) + log_search() to 3 routes
  tests/
    test_auth.py               NEW  4 unit tests for auth.py
    test_activity_log.py       NEW  3 unit tests for activity_log.py

apps/web/
  package.json                 MOD  add @supabase/supabase-js, @supabase/ssr
  .env.local                   MOD  add SUPABASE vars + API_BASE
  lib/
    supabase/
      browser.ts               NEW  createBrowserClient helper
      server.ts                NEW  createServerClient helper (reads Next.js cookies)
  middleware.ts                NEW  session refresh + redirect unauthenticated to /login
  lib/api.ts                   MOD  fetchJson accepts token param; API_BASE from env
  app/
    layout.tsx                 MOD  add logout button in header
    login/page.tsx             NEW  email input → send OTP → verify OTP (client component)
    onboarding/page.tsx        NEW  preferred postal code + optional phone (client component)
    page.tsx                   MOD  get session token, pass to getFlyers/getRecommendations
    flyers/page.tsx            MOD  get session token, pass to getFlyers
    flyers/[store]/page.tsx    MOD  get session token, pass to getFlyer
    recommendations/page.tsx   MOD  get session token, pass to getRecommendations

apps/mobile/
  package.json                 MOD  add @supabase/supabase-js, @react-native-async-storage/async-storage
  .env                         MOD  add EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
  lib/
    supabase.ts                NEW  Supabase client with AsyncStorage persistence
  lib/api.ts                   MOD  fetchJson reads session token and sets Authorization header
  app/
    _layout.tsx                MOD  auth guard: redirect to /login if no session
    login.tsx                  NEW  email OTP login screen (two-step)
    onboarding.tsx             NEW  preferred postal code + optional phone screen
```

---

## Task 1: Supabase SQL Schema + Env Config

**Files:**
- Create: `supabase/migrations/001_auth_schema.sql`
- Modify: `apps/api/.env` (add 3 vars)
- Modify: `apps/web/.env.local` (add 3 vars)
- Modify: `apps/mobile/.env` (add 2 vars)

> **Prerequisite:** Create a Supabase project at https://supabase.com → copy Project URL, anon key, service role key, JWT secret from Dashboard → Settings → API.

- [ ] **Step 1: Create the SQL migration file**

```bash
mkdir -p supabase/migrations
```

Create `supabase/migrations/001_auth_schema.sql`:

```sql
-- ── user_profiles ────────────────────────────────────────────────────────────
-- Extends the built-in auth.users table (Supabase manages auth.users).
-- One row per user, created automatically on signup via trigger.
CREATE TABLE public.user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone                 TEXT,                              -- optional
  preferred_postal_code TEXT,                              -- optional, e.g. 'L3R 0B1'
  is_whitelisted        BOOLEAN NOT NULL DEFAULT FALSE,    -- beta gate
  onboarding_done       BOOLEAN NOT NULL DEFAULT FALSE,    -- redirects to /onboarding on first login
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: insert a skeleton profile row whenever a new auth.users row is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles(id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS: each user can only read/update their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL USING (auth.uid() = id);

-- ── search_logs ──────────────────────────────────────────────────────────────
-- One row per API call. Written server-side by FastAPI (service role key).
CREATE TABLE public.search_logs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  postal_code     TEXT NOT NULL,
  -- 'flyers' | 'flyer_detail' | 'recommendations'
  query_type      TEXT NOT NULL CHECK (query_type IN ('flyers', 'flyer_detail', 'recommendations')),
  -- 'groceries' today; extend to 'hardware', 'electronics', etc. later
  flyer_category  TEXT NOT NULL DEFAULT 'groceries',
  store_name      TEXT,         -- only for query_type='flyer_detail'
  response_ms     INTEGER,      -- API wall-clock time in milliseconds
  searched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for admin analytics queries
CREATE INDEX idx_search_logs_user    ON public.search_logs(user_id, searched_at DESC);
CREATE INDEX idx_search_logs_postal  ON public.search_logs(postal_code);
CREATE INDEX idx_search_logs_cat     ON public.search_logs(flyer_category);

-- RLS: users can read their own logs; admin uses service role key (bypasses RLS)
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_logs" ON public.search_logs
  FOR SELECT USING (auth.uid() = user_id);
```

- [ ] **Step 2: Run the SQL in Supabase**

Go to: Supabase Dashboard → SQL Editor → paste the entire file → Run.

Expected: no errors, two new tables visible in Table Editor.

- [ ] **Step 3: Verify trigger works**

In Supabase SQL Editor:
```sql
-- After any test signup, confirm profile row was auto-created
SELECT id, is_whitelisted, onboarding_done FROM public.user_profiles LIMIT 5;
```

Expected: rows appear matching auth.users.

- [ ] **Step 4: Add env variables to FastAPI**

Append to `apps/api/.env` (create if not exists):
```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
SUPABASE_JWT_SECRET=<jwt_secret>
BETA_MODE=true
```

- [ ] **Step 5: Add env variables to web**

Append to `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
API_BASE=http://localhost:8000
```

- [ ] **Step 6: Add env variables to mobile**

Append to `apps/mobile/.env` (create if not exists):
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/001_auth_schema.sql
git commit -m "feat: add Supabase auth schema (user_profiles + search_logs)"
```

---

## Task 2: FastAPI `auth.py` (TDD)

**Files:**
- Create: `apps/api/auth.py`
- Create: `apps/api/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_auth.py`:

```python
"""Tests for apps/api/auth.py — JWT validation and beta whitelist check."""
import time
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
import jwt as pyjwt

# ── helpers ──────────────────────────────────────────────────────────────────

SECRET = "test-jwt-secret-must-be-at-least-32-characters!!"

def _make_token(user_id: str, expired: bool = False) -> str:
    exp = int(time.time()) + (-1 if expired else 3600)
    return pyjwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": exp},
        SECRET,
        algorithm="HS256",
    )

# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("BETA_MODE", "true")

@pytest.fixture()
def auth(monkeypatch):
    """Return a freshly-imported auth module (env already patched)."""
    import importlib
    import auth as _auth
    # Patch the Supabase client so no real network calls happen
    monkeypatch.setattr(_auth, "_supabase", MagicMock())
    importlib.reload(_auth)
    monkeypatch.setattr(_auth, "_supabase", MagicMock())
    return _auth

# ── tests ─────────────────────────────────────────────────────────────────────

def test_missing_bearer_raises_401(auth):
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Token abc123")
    assert exc.value.status_code == 401
    assert "Bearer" in exc.value.detail

def test_invalid_token_raises_401(auth):
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Bearer not-a-jwt")
    assert exc.value.status_code == 401

def test_expired_token_raises_401(auth):
    token = _make_token("user-1", expired=True)
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()

def test_whitelisted_user_returns_user_id(auth):
    token = _make_token("user-abc")
    auth._supabase.table.return_value.select.return_value.eq.return_value \
        .maybe_single.return_value.execute.return_value.data = {"is_whitelisted": True}
    result = auth.get_current_user(authorization=f"Bearer {token}")
    assert result == "user-abc"

def test_non_whitelisted_raises_403(auth):
    token = _make_token("user-xyz")
    auth._supabase.table.return_value.select.return_value.eq.return_value \
        .maybe_single.return_value.execute.return_value.data = {"is_whitelisted": False}
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization=f"Bearer {token}")
    assert exc.value.status_code == 403

def test_beta_false_skips_whitelist_check(monkeypatch):
    monkeypatch.setenv("BETA_MODE", "false")
    import importlib, auth as _auth
    importlib.reload(_auth)
    token = _make_token("user-open")
    # _supabase should NOT be called at all
    mock_sb = MagicMock()
    monkeypatch.setattr(_auth, "_supabase", mock_sb)
    result = _auth.get_current_user(authorization=f"Bearer {token}")
    assert result == "user-open"
    mock_sb.table.assert_not_called()
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd apps/api && python -m pytest tests/test_auth.py -v
```

Expected: `ModuleNotFoundError: No module named 'auth'`

- [ ] **Step 3: Install new dependencies**

```bash
cd apps/api && pip install "supabase>=2.3.0" "PyJWT>=2.8.0"
```

- [ ] **Step 4: Create `apps/api/auth.py`**

```python
"""
FastAPI dependency: validate Supabase JWT, enforce beta whitelist.

Usage in a route:
    @app.get("/api/foo")
    def foo(user_id: str = Depends(get_current_user)):
        ...
"""
import os
import jwt as pyjwt
from fastapi import Depends, HTTPException, Header
from supabase import create_client, Client

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_JWT_SECRET: str = os.environ["SUPABASE_JWT_SECRET"]
BETA_MODE: bool = os.environ.get("BETA_MODE", "true").lower() == "true"

_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _decode_token(token: str) -> dict:
    """Decode and verify a Supabase-issued JWT. Raises HTTPException on failure."""
    try:
        return pyjwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(authorization: str = Header(...)) -> str:
    """
    Extract and validate the Supabase JWT from the Authorization header.
    In BETA_MODE, additionally verify is_whitelisted == True.
    Returns the user UUID string on success.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization[len("Bearer "):]
    payload = _decode_token(token)
    user_id: str = payload["sub"]

    if BETA_MODE:
        result = (
            _supabase.table("user_profiles")
            .select("is_whitelisted")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not result.data or not result.data.get("is_whitelisted"):
            raise HTTPException(
                status_code=403,
                detail="Not in beta whitelist. Your application is under review.",
            )

    return user_id
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/api && python -m pytest tests/test_auth.py -v
```

Expected:
```
PASSED tests/test_auth.py::test_missing_bearer_raises_401
PASSED tests/test_auth.py::test_invalid_token_raises_401
PASSED tests/test_auth.py::test_expired_token_raises_401
PASSED tests/test_auth.py::test_whitelisted_user_returns_user_id
PASSED tests/test_auth.py::test_non_whitelisted_raises_403
PASSED tests/test_auth.py::test_beta_false_skips_whitelist_check
6 passed
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/auth.py apps/api/tests/test_auth.py
git commit -m "feat: add FastAPI JWT auth dependency with beta whitelist"
```

---

## Task 3: FastAPI `activity_log.py` (TDD)

**Files:**
- Create: `apps/api/activity_log.py`
- Create: `apps/api/tests/test_activity_log.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_activity_log.py`:

```python
"""Tests for apps/api/activity_log.py — search activity logging."""
import pytest
from unittest.mock import MagicMock, call

@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key")

@pytest.fixture()
def log_module(monkeypatch):
    import importlib, activity_log
    importlib.reload(activity_log)
    mock_sb = MagicMock()
    monkeypatch.setattr(activity_log, "_supabase", mock_sb)
    return activity_log

def _inserted(log_module) -> dict:
    """Return the dict passed to .insert() in the last call."""
    return log_module._supabase.table.return_value.insert.call_args[0][0]

def test_log_search_basic_fields(log_module):
    log_module.log_search(
        user_id="uid-1",
        postal_code="l3r 0b1",
        query_type="flyers",
    )
    row = _inserted(log_module)
    assert row["user_id"] == "uid-1"
    assert row["postal_code"] == "L3R 0B1"   # uppercased + stripped
    assert row["query_type"] == "flyers"
    assert row["flyer_category"] == "groceries"  # default
    assert row["store_name"] is None

def test_log_search_flyer_detail_with_store(log_module):
    log_module.log_search(
        user_id="uid-2",
        postal_code="M5V 2T6",
        query_type="flyer_detail",
        store_name="Metro",
        response_ms=142,
    )
    row = _inserted(log_module)
    assert row["store_name"] == "Metro"
    assert row["response_ms"] == 142

def test_log_search_custom_flyer_category(log_module):
    log_module.log_search(
        user_id="uid-3",
        postal_code="V6B 1A1",
        query_type="flyers",
        flyer_category="hardware",   # future Home Depot category
    )
    row = _inserted(log_module)
    assert row["flyer_category"] == "hardware"

def test_log_search_silently_ignores_db_errors(log_module):
    log_module._supabase.table.return_value.insert.return_value \
        .execute.side_effect = Exception("connection refused")
    # Must not raise
    log_module.log_search(user_id="uid-4", postal_code="L3R0B1", query_type="recommendations")
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/api && python -m pytest tests/test_activity_log.py -v
```

Expected: `ModuleNotFoundError: No module named 'activity_log'`

- [ ] **Step 3: Create `apps/api/activity_log.py`**

```python
"""
Log user search activity to the Supabase search_logs table.

Called after every successful API response. Failures are swallowed silently
so a logging error never breaks the API response.

flyer_category values today: 'groceries'
Future values: 'hardware', 'electronics', 'pharmacy', etc.
"""
import os
from supabase import create_client, Client

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]

_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def log_search(
    *,
    user_id: str,
    postal_code: str,
    query_type: str,
    flyer_category: str = "groceries",
    store_name: str | None = None,
    response_ms: int | None = None,
) -> None:
    """
    Insert one row into search_logs.

    Args:
        user_id:        Supabase auth user UUID.
        postal_code:    Canadian postal code, e.g. 'L3R 0B1'. Auto-uppercased.
        query_type:     'flyers' | 'flyer_detail' | 'recommendations'
        flyer_category: Store category. Default 'groceries'. Future: 'hardware', etc.
        store_name:     Store name for query_type='flyer_detail', else None.
        response_ms:    API wall-clock response time in milliseconds.
    """
    try:
        _supabase.table("search_logs").insert({
            "user_id": user_id,
            "postal_code": postal_code.upper().strip(),
            "query_type": query_type,
            "flyer_category": flyer_category,
            "store_name": store_name,
            "response_ms": response_ms,
        }).execute()
    except Exception:
        pass  # Never let logging break the API response
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && python -m pytest tests/test_activity_log.py -v
```

Expected:
```
PASSED tests/test_activity_log.py::test_log_search_basic_fields
PASSED tests/test_activity_log.py::test_log_search_flyer_detail_with_store
PASSED tests/test_activity_log.py::test_log_search_custom_flyer_category
PASSED tests/test_activity_log.py::test_silently_ignores_db_errors
4 passed
```

- [ ] **Step 5: Run full backend test suite**

```bash
cd apps/api && python -m pytest -v
```

Expected: all existing tests + 10 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/activity_log.py apps/api/tests/test_activity_log.py
git commit -m "feat: add search activity logger to Supabase search_logs"
```

---

## Task 4: FastAPI `server.py` + `requirements.txt` Integration

**Files:**
- Modify: `apps/api/requirements.txt`
- Modify: `apps/api/server.py`

- [ ] **Step 1: Update `requirements.txt`**

Replace the contents of `apps/api/requirements.txt` with:

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
httpx==0.27.0
pytest==8.2.0
supabase>=2.3.0
PyJWT>=2.8.0
```

- [ ] **Step 2: Update `server.py` — add imports and CORS**

At the top of `apps/api/server.py`, add these imports after the existing imports:

```python
import time
from auth import get_current_user
from activity_log import log_search
```

Replace the existing `CORSMiddleware` block:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-domain.com",        # replace with actual domain
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

- [ ] **Step 3: Update the `/api/flyers` route**

Replace the existing `get_flyers` function:

```python
@app.get("/api/flyers")
def get_flyers(
    postal_code: str = Query(..., min_length=6),
    user_id: str = Depends(get_current_user),
):
    svc = _make_service()
    t0 = time.monotonic()
    try:
        result = svc.get_grocery_flyers(postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    log_search(
        user_id=user_id,
        postal_code=postal_code,
        query_type="flyers",
        flyer_category="groceries",
        response_ms=int((time.monotonic() - t0) * 1000),
    )
    return result
```

- [ ] **Step 4: Update the `/api/flyer` route**

Replace the existing `get_flyer` function:

```python
@app.get("/api/flyer")
def get_flyer(
    store: str = Query(...),
    postal_code: str = Query(..., min_length=6),
    user_id: str = Depends(get_current_user),
):
    svc = _make_service()
    enricher = _make_enricher()
    t0 = time.monotonic()
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
            "price_text": it["price_text"],
            "category": enr[it["name"]]["category"],
            "emoji": enr[it["name"]]["emoji"],
            "category_zh": enr[it["name"]]["category_zh"],
            "zh_name": enr[it["name"]]["zh_name"],
            "is_grocery": enr[it["name"]]["is_grocery"],
        }
        for it in priced
    ]
    log_search(
        user_id=user_id,
        postal_code=postal_code,
        query_type="flyer_detail",
        flyer_category="groceries",
        store_name=store,
        response_ms=int((time.monotonic() - t0) * 1000),
    )
    return {"store": flyer["store"], "stale": flyer["stale"], "items": enriched_items}
```

- [ ] **Step 5: Update the `/api/recommendations` route**

Replace the existing `get_recommendations` function:

```python
@app.get("/api/recommendations")
def get_recommendations(
    postal_code: str = Query(..., min_length=6),
    user_id: str = Depends(get_current_user),
):
    t0 = time.monotonic()
    try:
        engine = RecommendationEngine(_make_service(), _make_enricher())
        result = engine.generate(postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    log_search(
        user_id=user_id,
        postal_code=postal_code,
        query_type="recommendations",
        flyer_category="groceries",
        response_ms=int((time.monotonic() - t0) * 1000),
    )
    return result
```

- [ ] **Step 6: Verify server starts**

```bash
cd apps/api && uvicorn server:app --reload --port 8000
```

Expected: server starts, docs at http://localhost:8000/docs show all routes now have lock icon (🔒 security).

- [ ] **Step 7: Smoke-test auth enforcement**

```bash
curl -s http://localhost:8000/api/flyers?postal_code=L3R0B1
```

Expected:
```json
{"detail":"Missing Bearer token"}
```
HTTP status: 401.

- [ ] **Step 8: Run full test suite (existing server tests will need updating)**

```bash
cd apps/api && python -m pytest tests/test_server.py -v
```

The existing `test_server.py` tests call routes without auth and will now fail with 422 (missing header). Open `apps/api/tests/test_server.py` and add the Authorization header to every test client call. Pattern — replace every:

```python
response = client.get("/api/flyers?postal_code=L3R0B1")
```

with:

```python
response = client.get(
    "/api/flyers?postal_code=L3R0B1",
    headers={"Authorization": "Bearer test-token"},
)
```

Then add a fixture at the top of `test_server.py` that patches `get_current_user` for all server tests:

```python
import pytest
from unittest.mock import patch

@pytest.fixture(autouse=True)
def bypass_auth():
    with patch("server.get_current_user", return_value="test-user-id"):
        yield
```

Re-run:
```bash
cd apps/api && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/requirements.txt apps/api/server.py apps/api/tests/test_server.py
git commit -m "feat: wire auth + activity logging into all FastAPI routes"
```

---

## Task 5: Web — Supabase Clients + Middleware + `api.ts`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/lib/supabase/browser.ts`
- Create: `apps/web/lib/supabase/server.ts`
- Create: `apps/web/middleware.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Install Supabase packages**

```bash
cd apps/web && npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create `apps/web/lib/supabase/browser.ts`**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Create `apps/web/lib/supabase/server.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server component — cookie writes are ignored (middleware handles refresh)
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Create `apps/web/middleware.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/onboarding"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — MUST be called before any redirect
  const { data: { user } } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 5: Update `apps/web/lib/api.ts`**

Replace the entire file:

```typescript
// API response types + fetch helpers.
// All calls are server-side; token comes from the Supabase server session.

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

// Server-side only: reads from process.env
const API_BASE = process.env.API_BASE ?? "http://localhost:8000";

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getFlyers(postalCode: string, token: string): Promise<FlyersResponse> {
  return fetchJson<FlyersResponse>(
    `/api/flyers?postal_code=${encodeURIComponent(postalCode)}`,
    token,
  );
}

export function getFlyer(
  store: string,
  postalCode: string,
  token: string,
): Promise<FlyerResponse> {
  return fetchJson<FlyerResponse>(
    `/api/flyer?store=${encodeURIComponent(store)}&postal_code=${encodeURIComponent(postalCode)}`,
    token,
  );
}

export function getRecommendations(
  postalCode: string,
  token: string,
): Promise<RecommendationsResponse> {
  return fetchJson<RecommendationsResponse>(
    `/api/recommendations?postal_code=${encodeURIComponent(postalCode)}`,
    token,
  );
}
```

- [ ] **Step 6: Add logout button to `apps/web/app/layout.tsx`**

Replace the entire file:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "本周特价 / Grocery Deals",
  description: "加拿大杂货特价推荐 / Canadian Grocery Deals",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span className="text-xl font-bold">
              <span aria-hidden="true">🛒</span> 本周特价 / This Week's Deals
            </span>
            {user && <LogoutButton />}
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create `apps/web/components/LogoutButton.tsx`**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-gray-500 hover:text-gray-800"
    >
      退出
    </button>
  );
}
```

- [ ] **Step 8: Verify TypeScript builds (will show errors in the 4 pages — expected)**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: errors in `app/page.tsx`, `app/flyers/page.tsx`, `app/flyers/[store]/page.tsx`, `app/recommendations/page.tsx` because `getFlyers` etc. now require a `token` argument. These are fixed in Task 6.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/supabase apps/web/middleware.ts apps/web/lib/api.ts apps/web/app/layout.tsx apps/web/components/LogoutButton.tsx apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add Supabase clients, middleware, auth token wiring for web"
```

---

## Task 6: Web — `/login`, `/onboarding` Pages + Fix Existing Pages

**Files:**
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/onboarding/page.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/flyers/page.tsx`
- Modify: `apps/web/app/flyers/[store]/page.tsx`
- Modify: `apps/web/app/recommendations/page.tsx`

- [ ] **Step 1: Create `apps/web/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setStep("otp");
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) { setError(error.message); return; }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("onboarding_done")
      .eq("id", data.user!.id)
      .single();

    router.push(profile?.onboarding_done ? "/" : "/onboarding");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span aria-hidden="true">🛒</span> Grocery AI
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === "email"
              ? "输入邮箱登录 / Enter your email to sign in"
              : `验证码已发送至 ${email} / Check your inbox`}
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {step === "email" ? (
          <div className="space-y-3">
            <label htmlFor="email" className="sr-only">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              autoFocus
            />
            <button
              onClick={sendOtp}
              disabled={loading || !email.includes("@")}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "发送中..." : "发送验证码 / Send code"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label htmlFor="otp" className="sr-only">验证码</label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="6 位验证码"
              maxLength={6}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && verifyOtp()}
              autoFocus
            />
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "验证中..." : "登录 / Verify"}
            </button>
            <button
              onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              className="w-full text-gray-400 text-sm hover:text-gray-600"
            >
              ← 重新输入邮箱 / Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/onboarding/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const postalValid = !postalCode || POSTAL_RE.test(postalCode);

  async function save(skip = false) {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error: err } = await supabase
      .from("user_profiles")
      .update({
        phone: skip ? null : (phone.trim() || null),
        preferred_postal_code: skip ? null : (postalCode.trim().toUpperCase() || null),
        onboarding_done: true,
      })
      .eq("id", user.id);

    setLoading(false);
    if (err) { setError(err.message); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">完善资料</h1>
          <p className="text-sm text-gray-500 mt-1">
            仅需一次 / Fill in once, edit any time
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="postal" className="block text-sm font-medium text-gray-700 mb-1">
              常用邮编 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              id="postal"
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="L3R 0B1"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {postalCode && !postalValid && (
              <p className="text-red-500 text-xs mt-1">
                格式应为 A1A 1A1 / Format: A1A 1A1
              </p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              手机号 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (416) 000-0000"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => save(false)}
            disabled={loading || !postalValid}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "保存中..." : "开始使用 / Get started"}
          </button>
          <button
            onClick={() => save(true)}
            className="w-full text-gray-400 text-sm hover:text-gray-600 py-1"
          >
            跳过 / Skip
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fix `apps/web/app/page.tsx` — add token**

Add after `const pc = postal_code ?? "";` (inside the `default async function`):

```tsx
// Get session token for FastAPI auth
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token ?? "";
```

Add `import { createClient } from "@/lib/supabase/server";` to the top.

All existing API calls in this file that use `getFlyers`, `getRecommendations`, or `getFlyer` must pass `token` as the last argument. For example:
```tsx
// Before:
data = await getFlyers(pc);
// After:
data = await getFlyers(pc, token);
```

- [ ] **Step 4: Fix `apps/web/app/flyers/page.tsx`**

Add these two lines after `const pc = postal_code ?? "";`:

```tsx
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token ?? "";
```

Add import at top:
```tsx
import { createClient } from "@/lib/supabase/server";
```

Change:
```tsx
data = await getFlyers(pc);
```
To:
```tsx
data = await getFlyers(pc, token);
```

- [ ] **Step 5: Fix `apps/web/app/flyers/[store]/page.tsx`**

Same pattern — add after `const pc = postal_code ?? "";`:

```tsx
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token ?? "";
```

Add import at top:
```tsx
import { createClient } from "@/lib/supabase/server";
```

Change:
```tsx
data = await getFlyer(store, pc);
```
To:
```tsx
data = await getFlyer(store, pc, token);
```

- [ ] **Step 6: Fix `apps/web/app/recommendations/page.tsx`**

Same pattern — add after `const pc = postal_code ?? "";`:

```tsx
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token ?? "";
```

Add import at top:
```tsx
import { createClient } from "@/lib/supabase/server";
```

Change:
```tsx
data = await getRecommendations(pc);
```
To:
```tsx
data = await getRecommendations(pc, token);
```

- [ ] **Step 7: TypeScript check — no errors**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Build check**

```bash
cd apps/web && npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 9: Manual smoke test**

Start API: `cd apps/api && uvicorn server:app --reload --port 8000`
Start web: `cd apps/web && npm run dev`

1. Open http://localhost:3000 → should redirect to http://localhost:3000/login
2. Enter email → click "发送验证码" → check inbox for OTP
3. Enter OTP → should redirect to /onboarding (first login)
4. Fill in postal code → click "开始使用" → should land on homepage

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/login apps/web/app/onboarding apps/web/app/page.tsx apps/web/app/flyers apps/web/app/recommendations
git commit -m "feat: add web login (email OTP), onboarding page, token-auth API calls"
```

---

## Task 7: Mobile — Supabase Client + `api.ts` JWT Injection

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/lib/supabase.ts`
- Modify: `apps/mobile/lib/api.ts`

- [ ] **Step 1: Install packages**

```bash
cd apps/mobile && npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
```

- [ ] **Step 2: Create `apps/mobile/lib/supabase.ts`**

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in env",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,  // Required for React Native
  },
});
```

- [ ] **Step 3: Update `apps/mobile/lib/api.ts` — inject JWT**

Add `import { supabase } from "./supabase";` at the top.

Replace the existing `fetchJson` function:

```typescript
async function fetchJson<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: Run existing mobile tests**

```bash
cd apps/mobile && npm test
```

Expected: existing 10 tests still pass (parsePriceUnit and PostalCodeInput tests are unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/supabase.ts apps/mobile/lib/api.ts apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat: add Supabase client to mobile + JWT injection in api.ts"
```

---

## Task 8: Mobile — Login Screen + Onboarding + `_layout.tsx` Auth Guard

**Files:**
- Create: `apps/mobile/app/login.tsx`
- Create: `apps/mobile/app/onboarding.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Create `apps/mobile/app/login.tsx`**

```tsx
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

type Step = "email" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setStep("otp");
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) { setError(error.message); return; }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("onboarding_done")
      .eq("id", data.user!.id)
      .single();

    router.replace(profile?.onboarding_done ? "/(tabs)" : "/onboarding");
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full space-y-6">
            <View className="space-y-1">
              <Text className="text-2xl font-bold text-gray-900">
                🛒 Grocery AI
              </Text>
              <Text className="text-sm text-gray-500">
                {step === "email"
                  ? "输入邮箱登录"
                  : `验证码已发送至\n${email}`}
              </Text>
            </View>

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            )}

            {step === "email" ? (
              <View className="space-y-3">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm"
                  accessibilityLabel="邮箱地址"
                />
                <TouchableOpacity
                  onPress={sendOtp}
                  disabled={loading || !email.includes("@")}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                  accessibilityRole="button"
                  accessibilityLabel="发送验证码"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "发送中..." : "发送验证码"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="space-y-3">
                <TextInput
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, ""))}
                  placeholder="6 位验证码"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-4 text-xl text-center font-mono tracking-widest"
                  accessibilityLabel="验证码"
                />
                <TouchableOpacity
                  onPress={verifyOtp}
                  disabled={loading || otp.length < 6}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                  accessibilityRole="button"
                  accessibilityLabel="登录"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "验证中..." : "登录"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setStep("email"); setOtp(""); setError(""); }}
                  accessibilityRole="button"
                >
                  <Text className="text-gray-400 text-sm text-center">
                    ← 重新输入邮箱
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Create `apps/mobile/app/onboarding.tsx`**

```tsx
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export default function OnboardingScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const postalValid = !postalCode || POSTAL_RE.test(postalCode);

  async function complete(skip = false) {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const { error: err } = await supabase
      .from("user_profiles")
      .update({
        phone: skip ? null : (phone.trim() || null),
        preferred_postal_code: skip
          ? null
          : (postalCode.trim().toUpperCase() || null),
        onboarding_done: true,
      })
      .eq("id", user.id);

    setLoading(false);
    if (err && !skip) { setError(err.message); return; }
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full space-y-6">
            <View className="space-y-1">
              <Text className="text-xl font-bold text-gray-900">完善资料</Text>
              <Text className="text-sm text-gray-500">
                仅需一次，随时可修改
              </Text>
            </View>

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            )}

            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  常用邮编{" "}
                  <Text className="text-gray-400 font-normal">（可选）</Text>
                </Text>
                <TextInput
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="L3R 0B1"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm"
                  accessibilityLabel="常用邮编"
                />
                {postalCode !== "" && !postalValid && (
                  <Text className="text-red-500 text-xs mt-1">
                    格式应为 A1A 1A1
                  </Text>
                )}
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  手机号{" "}
                  <Text className="text-gray-400 font-normal">（可选）</Text>
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+1 416 000 0000"
                  keyboardType="phone-pad"
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm"
                  accessibilityLabel="手机号"
                />
              </View>
            </View>

            <View className="space-y-2">
              <TouchableOpacity
                onPress={() => complete(false)}
                disabled={loading || !postalValid}
                className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                accessibilityRole="button"
                accessibilityLabel="开始使用"
              >
                <Text className="text-white font-semibold text-center">
                  {loading ? "保存中..." : "开始使用"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => complete(true)}
                accessibilityRole="button"
                accessibilityLabel="跳过"
              >
                <Text className="text-gray-400 text-sm text-center py-1">
                  跳过
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 3: Replace `apps/mobile/app/_layout.tsx` with auth guard**

```tsx
import "../global.css";
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { PostalCodeProvider } from "../lib/PostalCodeContext";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  // undefined = still loading; null = no session; Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Load persisted session on app start
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    // Subscribe to future auth state changes (logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session),
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading splash

    const inAuthFlow =
      segments[0] === "login" || segments[0] === "onboarding";

    if (!session && !inAuthFlow) {
      router.replace("/login");
    } else if (session && segments[0] === "login") {
      router.replace("/(tabs)");
    }
  }, [session, segments]);

  // Show nothing while determining auth state (prevents flash)
  if (session === undefined) return null;

  return (
    <PostalCodeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen
          name="flyer/[store]"
          options={{
            headerBackTitle: "返回",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        />
      </Stack>
    </PostalCodeProvider>
  );
}
```

- [ ] **Step 4: Run mobile tests**

```bash
cd apps/mobile && npm test
```

Expected: all 10 existing tests pass (login/onboarding screens have no unit tests; they require E2E).

- [ ] **Step 5: Manual smoke test on simulator**

```bash
cd apps/mobile && npx expo start --ios
```

1. App launches → login screen appears (no tabs visible)
2. Enter email → OTP arrives in inbox
3. Enter OTP → onboarding screen
4. Fill postal code → tabs appear, app works normally
5. Kill and reopen app → lands directly on tabs (session persisted)
6. Test API calls show 200 in terminal (not 401)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/login.tsx apps/mobile/app/onboarding.tsx apps/mobile/app/_layout.tsx
git commit -m "feat: add mobile login (email OTP), onboarding screen, auth guard"
```

---

## Whitelist Management (Admin Reference)

To whitelist a user during beta:

```sql
-- Find the user by email
SELECT id, email FROM auth.users WHERE email = 'user@example.com';

-- Grant access
UPDATE public.user_profiles
SET is_whitelisted = true
WHERE id = '<paste-uuid-here>';
```

To view all search activity for a user:

```sql
SELECT
  u.email,
  l.postal_code,
  l.query_type,
  l.flyer_category,
  l.store_name,
  l.response_ms,
  l.searched_at
FROM search_logs l
JOIN auth.users u ON u.id = l.user_id
WHERE u.email = 'user@example.com'
ORDER BY l.searched_at DESC
LIMIT 50;
```

To switch to open registration:

```bash
# In apps/api/.env
BETA_MODE=false
# Restart FastAPI — no code changes needed
```

---

## Self-Review

**1. Spec coverage check:**
- ✅ Email OTP login — Tasks 6 (web), 8 (mobile)
- ✅ Beta whitelist — Task 2 (`auth.py` `BETA_MODE` + `is_whitelisted`)
- ✅ Open registration toggle — `BETA_MODE=false`, no code change
- ✅ User profiles (phone optional, preferred postal code) — Task 1 SQL + Tasks 6/8 onboarding
- ✅ Email verification via OTP — Supabase `signInWithOtp` / `verifyOtp`
- ✅ Activity logging with `flyer_category` — Tasks 3/4 (`activity_log.py`, server routes)
- ✅ Works on Web (Next.js) — Tasks 5/6
- ✅ Works on Mobile (Expo) — Tasks 7/8
- ✅ FastAPI protected — Task 4

**2. Placeholder scan:** None found. All code blocks are complete.

**3. Type consistency check:**
- `get_current_user` returns `str` (user UUID) — matches `user_id: str` in all route signatures ✅
- `log_search(user_id=user_id, ...)` — keyword-only args match definition in `activity_log.py` ✅
- `fetchJson<T>(path, token)` — all 3 callers pass token ✅
- `supabase.auth.getSession()` on mobile → `session?.access_token` matches `Authorization: Bearer {token}` ✅
