"""
FastAPI HTTP server — wraps the existing Flipp service and enricher.

Run:  uvicorn server:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

import os
import sqlite3
import threading
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware

from auth import get_current_user
from activity_log import log_search

from flipp.client import FlippClient, FlippError
from flipp.cache import SqliteCache
from flipp.service import FlyerRetrievalService
from flipp.enrich import AnthropicClient, Enricher, STABLE_TTL
from flipp.recommend import RecommendationEngine

_DB = os.environ.get(
    "FLIPP_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "flipp_cache.db")
)

# Recommendation results are deterministic per (postal_code + store_filter) and
# change at most once a week. Cache them for 6 hours so repeated calls are <5ms.
_REC_TTL = 6 * 60 * 60
_rec_cache = SqliteCache(_DB, ttl=_REC_TTL)


def _warm_cache() -> None:
    """
    Background thread: pre-compute recommendations for every postal code that
    already has flyer data in the DB. Runs once at startup; re-warms stale entries.
    Each iteration is fully self-contained so a failure for one postal code does
    not affect the others.
    """
    try:
        conn = sqlite3.connect(_DB)
        rows = conn.execute(
            "SELECT key FROM cache WHERE key LIKE 'flyers:%'"
        ).fetchall()
        conn.close()
        postal_codes = [r[0].split(":", 1)[1] for r in rows]
    except Exception:
        return

    if not postal_codes:
        return

    svc = _make_service()
    enricher = _make_enricher()
    engine = RecommendationEngine(svc, enricher)

    for pc in postal_codes:
        try:
            rec_key = f"rec:{pc}:"
            cached = _rec_cache.get(rec_key)
            if cached is not None and not cached[1]:
                continue  # still fresh — skip
            result = engine.generate(pc)
            _rec_cache.set(rec_key, result)
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_warm_cache, daemon=True).start()
    yield


app = FastAPI(title="Grocery Flyer AI API", version="1.0", lifespan=lifespan)

_extra_origins = [o for o in [os.environ.get("WEB_ORIGIN")] if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"] + _extra_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_timing(request: Request, call_next):
    t0 = time.monotonic()
    response = await call_next(request)
    ms = int((time.monotonic() - t0) * 1000)
    print(f"  → {request.method} {request.url.path} {response.status_code}  took {ms}ms")
    return response


def _make_service() -> FlyerRetrievalService:
    return FlyerRetrievalService(FlippClient(), SqliteCache(_DB))


def _make_enricher() -> Enricher:
    return Enricher(AnthropicClient(), SqliteCache(_DB, ttl=STABLE_TTL))


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


@app.get("/api/recommendations")
def get_recommendations(
    postal_code: str = Query(..., min_length=6),
    stores: str | None = Query(None),   # comma-separated merchant names
    user_id: str = Depends(get_current_user),
):
    t0 = time.monotonic()
    store_filter: list[str] | None = None
    if stores:
        parts = [s.strip() for s in stores.split(",") if s.strip()]
        store_filter = parts if parts else None

    pc = postal_code.replace(" ", "").upper()
    store_key = ",".join(sorted(store_filter)) if store_filter else ""
    rec_key = f"rec:{pc}:{store_key}"

    cached = _rec_cache.get(rec_key)
    if cached is not None and not cached[1]:
        log_search(
            user_id=user_id,
            postal_code=postal_code,
            query_type="recommendations",
            flyer_category="groceries",
            response_ms=int((time.monotonic() - t0) * 1000),
        )
        return cached[0]

    try:
        engine = RecommendationEngine(_make_service(), _make_enricher())
        result = engine.generate(postal_code, store_filter=store_filter)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    _rec_cache.set(rec_key, result)
    log_search(
        user_id=user_id,
        postal_code=postal_code,
        query_type="recommendations",
        flyer_category="groceries",
        response_ms=int((time.monotonic() - t0) * 1000),
    )
    return result
