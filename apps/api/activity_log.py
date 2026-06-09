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
