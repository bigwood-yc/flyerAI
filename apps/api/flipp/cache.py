"""
A tiny SQLite-backed cache with a time-to-live.

Per TDR-003 the MVP uses SQLite (a single file, no server to run or pay for).
Per TDR-002 flyer data is cached for 24 hours and refreshed once a day; clients
always read from cache. This module is the storage layer for that.

Standard library only (sqlite3 is built in).
"""

import json
import sqlite3
import threading
import time

DEFAULT_TTL = 24 * 60 * 60  # 24 hours, in seconds


class SqliteCache:
    def __init__(self, path: str = "flipp_cache.db", ttl: int = DEFAULT_TTL):
        self.path = path
        self.ttl = ttl
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        # WAL mode allows concurrent reads while a write is in progress.
        # Falls back silently on :memory: databases (used in tests).
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS cache ("
            "  key TEXT PRIMARY KEY,"
            "  payload TEXT NOT NULL,"
            "  fetched_at REAL NOT NULL"
            ")"
        )
        self._conn.commit()

    def set(self, key: str, value) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO cache(key, payload, fetched_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), time.time()),
            )
            self._conn.commit()

    def get(self, key: str):
        """
        Return (value, is_stale) or None if the key was never cached.
        is_stale is True when the entry is older than the TTL but still usable
        as a fallback when a refresh fails.
        """
        with self._lock:
            row = self._conn.execute(
                "SELECT payload, fetched_at FROM cache WHERE key = ?", (key,)
            ).fetchone()
        if row is None:
            return None
        payload, fetched_at = row
        is_stale = (time.time() - fetched_at) > self.ttl
        return json.loads(payload), is_stale

    def close(self) -> None:
        self._conn.close()
