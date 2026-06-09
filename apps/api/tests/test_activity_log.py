"""Tests for apps/api/activity_log.py — search activity logging."""
import pytest
from unittest.mock import MagicMock

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
