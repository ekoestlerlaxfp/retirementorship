"""
Iteration 9: Save/Bookmark + Reading History end-to-end tests.

Verifies:
- All 4 content kinds (book, magazine, article, video) can be bookmarked with string post_ids
- GET /api/user/bookmarks returns correct fields & sorted desc by created_at
- GET /api/user/bookmarks/ids returns all ids as strings
- Add-bookmark is idempotent (upsert on duplicate)
- DELETE with string id containing dashes works
- History add/list for the same 4 kinds; progress preserved
- Unauthenticated 401 across all 6 endpoints
- Startup migration of int post_ids -> string
"""
import os
import asyncio
import secrets
from datetime import datetime, timezone, timedelta

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# NOTE: Run this file with `-n 0` (serial). TestPostIdMigration restarts the
# backend to verify the startup migration hook; under the default pytest-xdist
# `--dist loadscope` in /app/backend/pytest.ini, the four classes below get
# distributed across workers and race with the restart. Command:
#   pytest backend/tests/test_iteration9_bookmarks_history.py -n 0 -v

# Backend env — read Mongo URL/DB name directly
load_dotenv("/app/backend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fall back to frontend env
    from dotenv import dotenv_values
    fe = dotenv_values("/app/frontend/.env")
    BASE_URL = (fe.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL is required"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")

TEST_USER_ID = "test-bm-user"
TEST_EMAIL = "test-bm@x.local"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def session_token(event_loop):
    """Create a test user + session directly in MongoDB, yield token, cleanup after."""
    async def _setup():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        # Clean pre-existing test data
        await db.users.delete_many({"user_id": TEST_USER_ID})
        await db.user_sessions.delete_many({"user_id": TEST_USER_ID})
        await db.bookmarks.delete_many({"user_id": TEST_USER_ID})
        await db.history.delete_many({"user_id": TEST_USER_ID})
        await db.users.insert_one({
            "user_id": TEST_USER_ID,
            "email": TEST_EMAIL,
            "name": "Test BM",
            "source": "test",
            "created_at": datetime.now(timezone.utc),
        })
        tok = secrets.token_urlsafe(32)
        await db.user_sessions.insert_one({
            "session_token": tok,
            "user_id": TEST_USER_ID,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        })
        client.close()
        return tok

    tok = event_loop.run_until_complete(_setup())
    yield tok

    async def _teardown():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.users.delete_many({"user_id": TEST_USER_ID})
        await db.user_sessions.delete_many({"user_id": TEST_USER_ID})
        await db.bookmarks.delete_many({"user_id": TEST_USER_ID})
        await db.history.delete_many({"user_id": TEST_USER_ID})
        client.close()

    event_loop.run_until_complete(_teardown())


@pytest.fixture(scope="module")
def auth_headers(session_token):
    return {"Authorization": f"Bearer {session_token}", "Content-Type": "application/json"}


# ---------- Test payloads ----------
BOOKMARKS = [
    {"post_id": "book-3d-retirement-income", "title": "3D Retirement Income", "type": "book",
     "category": "Books", "image": "https://example.com/book.webp"},
    {"post_id": "mag-rmag-vol-1", "title": "Volume 1 · Spring 2023", "type": "magazine",
     "category": "Magazine", "image": "https://example.com/mag.webp"},
    {"post_id": "12345", "title": "How to Retire in 5 Steps", "type": "article",
     "category": "Planning", "image": "https://example.com/article.webp"},
    {"post_id": "67890", "title": "Retirement Video Walkthrough", "type": "video",
     "category": "Video", "image": "https://example.com/video.webp"},
]


# ---------- Bookmarks ----------
class TestBookmarks:
    """POST/GET/DELETE /api/user/bookmarks with string post_ids across all 4 content kinds."""

    def test_add_all_four_kinds(self, auth_headers):
        for bm in BOOKMARKS:
            r = requests.post(f"{BASE_URL}/api/user/bookmarks", json=bm, headers=auth_headers, timeout=15)
            assert r.status_code == 200, f"POST bookmark {bm['post_id']} -> {r.status_code} {r.text}"
            assert r.json().get("ok") is True

    def test_list_returns_all_four_with_fields(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/user/bookmarks", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        ids = {d["post_id"] for d in docs}
        expected = {bm["post_id"] for bm in BOOKMARKS}
        assert expected.issubset(ids), f"Missing bookmarks. Got {ids}, expected {expected}"

        # Every bookmark should be a STRING id and have core fields
        by_id = {d["post_id"]: d for d in docs}
        for bm in BOOKMARKS:
            d = by_id[bm["post_id"]]
            assert isinstance(d["post_id"], str), f"post_id not string: {d['post_id']!r}"
            assert d["title"] == bm["title"]
            assert d["type"] == bm["type"]
            assert d["category"] == bm["category"]
            assert d["image"] == bm["image"]
            assert "created_at" in d
            assert "_id" not in d, "MongoDB _id must not be leaked in response"

    def test_list_sorted_desc_by_created_at(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/user/bookmarks", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        # Filter to only our test docs (in case others exist)
        expected = {bm["post_id"] for bm in BOOKMARKS}
        ours = [d for d in docs if d["post_id"] in expected]
        # created_at should be strictly non-increasing
        timestamps = [d["created_at"] for d in ours]
        assert timestamps == sorted(timestamps, reverse=True), f"Not sorted desc: {timestamps}"

    def test_ids_endpoint_returns_strings(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/user/bookmarks/ids", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        ids = r.json()
        assert isinstance(ids, list)
        expected = {bm["post_id"] for bm in BOOKMARKS}
        got = set(ids)
        assert expected.issubset(got), f"Missing ids. Got {got}, expected {expected}"
        # All must be strings
        for i in ids:
            assert isinstance(i, str), f"non-string id: {i!r}"

    def test_add_is_idempotent_upsert(self, auth_headers):
        """Posting same post_id twice must not create duplicates."""
        bm = BOOKMARKS[0]  # book-3d-retirement-income
        # Post again with updated title
        updated = {**bm, "title": "3D Retirement Income (Updated)"}
        r = requests.post(f"{BASE_URL}/api/user/bookmarks", json=updated, headers=auth_headers, timeout=15)
        assert r.status_code == 200

        r2 = requests.get(f"{BASE_URL}/api/user/bookmarks", headers=auth_headers, timeout=15)
        docs = r2.json()
        matching = [d for d in docs if d["post_id"] == bm["post_id"]]
        assert len(matching) == 1, f"Expected 1 bookmark, got {len(matching)}: {matching}"
        assert matching[0]["title"] == "3D Retirement Income (Updated)", "Upsert should update title"

    def test_delete_string_id_with_dashes(self, auth_headers):
        pid = "book-3d-retirement-income"
        r = requests.delete(f"{BASE_URL}/api/user/bookmarks/{pid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"DELETE {pid} -> {r.status_code} {r.text}"
        assert r.json().get("ok") is True

        # Verify removed, others still present
        r2 = requests.get(f"{BASE_URL}/api/user/bookmarks/ids", headers=auth_headers, timeout=15)
        ids = set(r2.json())
        assert pid not in ids, "Deleted bookmark still returned"
        # Other 3 still present
        assert "mag-rmag-vol-1" in ids
        assert "12345" in ids
        assert "67890" in ids


# ---------- History ----------
class TestHistory:
    """POST/GET /api/user/history with string post_ids across all 4 kinds; progress preserved."""

    HISTORY_ITEMS = [
        {"post_id": "book-3d-retirement-income", "title": "3D Retirement Income", "type": "book",
         "category": "Books", "progress": 0.15},
        {"post_id": "mag-rmag-vol-1", "title": "Volume 1 · Spring 2023", "type": "magazine",
         "category": "Magazine", "progress": 0.5},
        {"post_id": "12345", "title": "How to Retire in 5 Steps", "type": "article",
         "category": "Planning", "progress": 0.9},
        {"post_id": "67890", "title": "Retirement Video Walkthrough", "type": "video",
         "category": "Video", "progress": 1.0},
    ]

    def test_add_all_four_kinds(self, auth_headers):
        import time as _t
        for h in self.HISTORY_ITEMS:
            r = requests.post(f"{BASE_URL}/api/user/history", json=h, headers=auth_headers, timeout=15)
            assert r.status_code == 200, f"POST history {h['post_id']} -> {r.status_code} {r.text}"
            assert r.json().get("ok") is True
            _t.sleep(0.05)  # ensure distinct updated_at ordering

    def test_list_returns_all_and_preserves_progress(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/user/history", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        by_id = {d["post_id"]: d for d in docs}
        for h in self.HISTORY_ITEMS:
            assert h["post_id"] in by_id, f"Missing history post_id={h['post_id']}"
            d = by_id[h["post_id"]]
            assert isinstance(d["post_id"], str)
            assert d["title"] == h["title"]
            assert d["type"] == h["type"]
            assert d["category"] == h["category"]
            assert abs(d["progress"] - h["progress"]) < 1e-6, f"progress mismatch: {d['progress']} vs {h['progress']}"
            assert "updated_at" in d
            assert "_id" not in d

    def test_list_sorted_desc_by_updated_at(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/user/history", headers=auth_headers, timeout=15)
        docs = r.json()
        expected = {h["post_id"] for h in self.HISTORY_ITEMS}
        ours = [d for d in docs if d["post_id"] in expected]
        timestamps = [d["updated_at"] for d in ours]
        assert timestamps == sorted(timestamps, reverse=True), f"History not sorted desc: {timestamps}"
        # Last inserted was video (67890) → should be first
        assert ours[0]["post_id"] == "67890"


# ---------- Unauthenticated 401 ----------
class TestUnauthenticated:
    """All 6 protected endpoints must return 401 without a valid Bearer token."""

    def test_get_bookmarks_401(self):
        r = requests.get(f"{BASE_URL}/api/user/bookmarks", timeout=10)
        assert r.status_code == 401

    def test_post_bookmarks_401(self):
        r = requests.post(f"{BASE_URL}/api/user/bookmarks",
                          json={"post_id": "x", "title": "y"}, timeout=10)
        assert r.status_code == 401

    def test_get_bookmark_ids_401(self):
        r = requests.get(f"{BASE_URL}/api/user/bookmarks/ids", timeout=10)
        assert r.status_code == 401

    def test_delete_bookmark_401(self):
        r = requests.delete(f"{BASE_URL}/api/user/bookmarks/some-id", timeout=10)
        assert r.status_code == 401

    def test_get_history_401(self):
        r = requests.get(f"{BASE_URL}/api/user/history", timeout=10)
        assert r.status_code == 401

    def test_post_history_401(self):
        r = requests.post(f"{BASE_URL}/api/user/history",
                          json={"post_id": "x", "title": "y"}, timeout=10)
        assert r.status_code == 401

    def test_bad_bearer_token_401(self):
        r = requests.get(f"{BASE_URL}/api/user/bookmarks",
                         headers={"Authorization": "Bearer not-a-real-token"}, timeout=10)
        assert r.status_code == 401


# ---------- Startup migration: int -> string ----------
class TestPostIdMigration:
    """Insert an int post_id row directly into Mongo, restart backend, verify string conversion."""

    MIG_USER = "test-bm-migration"

    def test_int_post_id_migrates_to_string(self):
        import subprocess
        import time as _t

        async def _seed():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            # Clean prior
            await db.bookmarks.delete_many({"user_id": self.MIG_USER})
            await db.history.delete_many({"user_id": self.MIG_USER})
            # Insert INT post_id docs (bypass Pydantic — direct Mongo)
            await db.bookmarks.insert_one({
                "user_id": self.MIG_USER,
                "post_id": 55555,  # int
                "title": "Legacy Int Bookmark",
                "created_at": datetime.now(timezone.utc),
            })
            await db.history.insert_one({
                "user_id": self.MIG_USER,
                "post_id": 77777,
                "title": "Legacy Int History",
                "progress": 0.3,
                "updated_at": datetime.now(timezone.utc),
            })
            client.close()

        async def _verify():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            bm = await db.bookmarks.find_one({"user_id": self.MIG_USER})
            hist = await db.history.find_one({"user_id": self.MIG_USER})
            client.close()
            return bm, hist

        async def _cleanup():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            await db.bookmarks.delete_many({"user_id": self.MIG_USER})
            await db.history.delete_many({"user_id": self.MIG_USER})
            client.close()

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_seed())
            # Restart backend to trigger startup migration
            subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
            # Wait for backend to come back up
            for _ in range(30):
                _t.sleep(1)
                try:
                    hr = requests.get(f"{BASE_URL}/api/", timeout=3)
                    if hr.status_code == 200:
                        break
                except Exception:
                    continue
            _t.sleep(1)  # allow migration to finish
            bm, hist = loop.run_until_complete(_verify())
            assert bm is not None, "seed bookmark not found"
            assert hist is not None, "seed history not found"
            assert isinstance(bm["post_id"], str), f"bookmark post_id not migrated: {bm['post_id']!r} ({type(bm['post_id']).__name__})"
            assert bm["post_id"] == "55555"
            assert isinstance(hist["post_id"], str), f"history post_id not migrated: {hist['post_id']!r} ({type(hist['post_id']).__name__})"
            assert hist["post_id"] == "77777"
        finally:
            loop.run_until_complete(_cleanup())
            loop.close()
