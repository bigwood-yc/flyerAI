"""
FastAPI dependency: validate Supabase JWT, enforce beta whitelist.

Delegates JWT verification to the Supabase Auth API (supabase.auth.get_user),
which works regardless of signing algorithm (HS256 legacy or RS256 new keys).

Usage in a route:
    @app.get("/api/foo")
    def foo(user_id: str = Depends(get_current_user)):
        ...
"""
import os
from fastapi import HTTPException, Header
from supabase import create_client, Client

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]

_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _get_user_id(token: str) -> str:
    """Validate a Supabase JWT via the Auth API. Returns user_id on success."""
    try:
        response = _supabase.auth.get_user(token)
        if not response.user or not response.user.id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return response.user.id
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "expired" in msg:
            raise HTTPException(status_code=401, detail="Token expired")
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
    user_id = _get_user_id(token)

    beta_mode = os.environ.get("BETA_MODE", "true").lower() == "true"
    if beta_mode:
        try:
            result = (
                _supabase.table("user_profiles")
                .select("is_whitelisted")
                .eq("id", user_id)
                .maybe_single()
                .execute()
            )
        except Exception:
            raise HTTPException(status_code=503, detail="Auth service temporarily unavailable")
        if not result.data or not result.data.get("is_whitelisted"):
            raise HTTPException(
                status_code=403,
                detail="Not in beta whitelist. Your application is under review.",
            )

    return user_id
