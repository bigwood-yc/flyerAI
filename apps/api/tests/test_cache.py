"""SQLite cache — TTL and staleness behavior, no network."""

from flipp.cache import SqliteCache


def test_missing_key_returns_none(tmp_path):
    cache = SqliteCache(str(tmp_path / "c.db"))
    assert cache.get("nope") is None


def test_set_then_get_is_fresh(tmp_path):
    cache = SqliteCache(str(tmp_path / "c.db"))
    cache.set("k", {"a": 1})
    value, stale = cache.get("k")
    assert value == {"a": 1}
    assert stale is False


def test_entry_past_ttl_is_stale(tmp_path):
    cache = SqliteCache(str(tmp_path / "c.db"))
    cache.set("k", [1, 2, 3])
    # Push fetched_at far into the past so it exceeds the TTL.
    cache._conn.execute("UPDATE cache SET fetched_at = fetched_at - 1000000")
    cache._conn.commit()
    value, stale = cache.get("k")
    assert value == [1, 2, 3]
    assert stale is True
