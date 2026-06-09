"""
FastAPI dependency: validate Supabase JWT, enforce beta whitelist.

Usage in a route:
    @app.get("/api/foo")
    def foo(user_id: str = Depends(get_current_user)):
        ...
"""
import os
import jwt as pyjwt
from fastapi import HTTPException, Header
from supabase import create_client, Client

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_JWT_SECRET: str = os.environ["SUPABASE_JWT_SECRET"]

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
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing subject")

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
