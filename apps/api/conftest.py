"""
Pytest configuration for apps/api tests.

Sets dummy Supabase env vars at module level so auth.py can be imported
without crashing during test collection. Individual tests bypass auth via
app.dependency_overrides (test_server.py) or direct mocks (test_auth.py).
"""
import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
