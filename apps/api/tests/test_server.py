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
