"""Tests for apps/api/auth.py — JWT validation and beta whitelist check."""
import time
import pytest
from unittest.mock import MagicMock
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
    mock_sb = MagicMock()
    monkeypatch.setattr(_auth, "_supabase", mock_sb)
    importlib.reload(_auth)
    monkeypatch.setattr(_auth, "_supabase", mock_sb)
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

def test_beta_false_skips_whitelist_check(auth, monkeypatch):
    monkeypatch.setenv("BETA_MODE", "false")
    token = _make_token("user-open")
    result = auth.get_current_user(authorization=f"Bearer {token}")
    assert result == "user-open"
    auth._supabase.table.assert_not_called()

def test_token_without_sub_raises_401(auth):
    token = pyjwt.encode(
        {"aud": "authenticated", "exp": int(time.time()) + 3600},
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401
