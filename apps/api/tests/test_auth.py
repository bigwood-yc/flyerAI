"""Tests for apps/api/auth.py — JWT validation and beta whitelist check."""
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key")
    monkeypatch.setenv("BETA_MODE", "true")


@pytest.fixture()
def auth(monkeypatch):
    """Return a freshly-imported auth module with mocked Supabase client."""
    import importlib
    import auth as _auth
    mock_sb = MagicMock()
    monkeypatch.setattr(_auth, "_supabase", mock_sb)
    importlib.reload(_auth)
    monkeypatch.setattr(_auth, "_supabase", mock_sb)
    return _auth


def _mock_user(auth_module, user_id: str) -> None:
    """Configure auth._supabase.auth.get_user to return a user with given id."""
    mock_resp = MagicMock()
    mock_resp.user.id = user_id
    auth_module._supabase.auth.get_user.return_value = mock_resp


# ── tests ─────────────────────────────────────────────────────────────────────

def test_missing_bearer_raises_401(auth):
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Token abc123")
    assert exc.value.status_code == 401
    assert "Bearer" in exc.value.detail


def test_invalid_token_raises_401(auth):
    auth._supabase.auth.get_user.side_effect = Exception("Invalid JWT")
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Bearer not-a-jwt")
    assert exc.value.status_code == 401


def test_expired_token_raises_401(auth):
    auth._supabase.auth.get_user.side_effect = Exception("JWT expired")
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Bearer expired-token")
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()


def test_whitelisted_user_returns_user_id(auth):
    _mock_user(auth, "user-abc")
    auth._supabase.table.return_value.select.return_value.eq.return_value \
        .maybe_single.return_value.execute.return_value.data = {"is_whitelisted": True}
    result = auth.get_current_user(authorization="Bearer valid-token")
    assert result == "user-abc"


def test_non_whitelisted_raises_403(auth):
    _mock_user(auth, "user-xyz")
    auth._supabase.table.return_value.select.return_value.eq.return_value \
        .maybe_single.return_value.execute.return_value.data = {"is_whitelisted": False}
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Bearer valid-token")
    assert exc.value.status_code == 403


def test_beta_false_skips_whitelist_check(auth, monkeypatch):
    monkeypatch.setenv("BETA_MODE", "false")
    _mock_user(auth, "user-open")
    result = auth.get_current_user(authorization="Bearer valid-token")
    assert result == "user-open"
    auth._supabase.table.assert_not_called()


def test_token_with_no_user_raises_401(auth):
    mock_resp = MagicMock()
    mock_resp.user = None
    auth._supabase.auth.get_user.return_value = mock_resp
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Bearer token-no-user")
    assert exc.value.status_code == 401
