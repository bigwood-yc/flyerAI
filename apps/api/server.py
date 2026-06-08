"""
FastAPI HTTP server — wraps the existing Flipp service and enricher.

Run:  uvicorn server:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from flipp.client import FlippClient, FlippError
from flipp.cache import SqliteCache
from flipp.service import FlyerRetrievalService
from flipp.enrich import AnthropicClient, Enricher, STABLE_TTL
from flipp.recommend import RecommendationEngine

_DB = os.environ.get(
    "FLIPP_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "flipp_cache.db")
)

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
def get_flyers(postal_code: str = Query(..., min_length=6)):
    svc = _make_service()
    try:
        return svc.get_grocery_flyers(postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/flyer")
def get_flyer(
    store: str = Query(...),
    postal_code: str = Query(..., min_length=6),
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
def get_recommendations(postal_code: str = Query(..., min_length=6)):
    try:
        engine = RecommendationEngine(_make_service(), _make_enricher())
        return engine.generate(postal_code)
    except FlippError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
