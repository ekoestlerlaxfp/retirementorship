"""Iteration 20 — App Store readiness: account deletion + data purge regression.

Covers:
- register returns {session_token, user}
- DELETE /api/auth/account requires auth (401)
- DELETE /api/auth/account succeeds (200 + deleted_user_id)
- Login post-delete → 401
- Regression: /books anon locked, /wp/home-feed non-empty, /guides public
- Data-purge: bookmarks are truly removed, not orphaned to a re-created user.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_BACKEND_URL") else None
# fall back to the frontend .env
if not BASE_URL:
    from dotenv import dotenv_values
    BASE_URL = dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

assert BASE_URL, "EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL is required"


def _unique_email(prefix: str = "test_del") -> str:
    return f"TEST_{prefix}_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- 1. Register returns session_token + user ----
def test_register_returns_token_and_user(api):
    email = _unique_email("reg")
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "first_name": "Test", "last_name": "User",
        "email": email, "phone": "+15551234", "password": "changeme123",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert "session_token" in body and body["session_token"]
    assert "user" in body and body["user"]["email"] == email.lower()
    assert body["user"]["user_id"].startswith("user_")


# ---- 2/3/4. Account deletion happy path ----
def test_delete_account_flow(api):
    email = _unique_email("del")
    password = "changeme123"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "first_name": "Del", "last_name": "Me",
        "email": email, "phone": "+15551234", "password": password,
    })
    assert r.status_code == 201, r.text
    token = r.json()["session_token"]
    user_id = r.json()["user"]["user_id"]

    # 2. DELETE without header → 401
    r_unauth = api.delete(f"{BASE_URL}/api/auth/account")
    assert r_unauth.status_code == 401, r_unauth.text

    # 3. DELETE with bearer → 200 + deleted_user_id
    r_del = api.delete(
        f"{BASE_URL}/api/auth/account",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_del.status_code == 200, r_del.text
    body = r_del.json()
    assert body.get("ok") is True
    assert body.get("deleted_user_id") == user_id

    # 4. Login with same credentials → 401 (account gone)
    r_login = api.post(f"{BASE_URL}/api/auth/login", json={
        "email": email, "password": password,
    })
    assert r_login.status_code == 401, r_login.text

    # Bonus: the old bearer token is now dead
    r_me = api.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_me.status_code == 401


# ---- 5. Regression: gated / public content still behaves ----
def test_books_anon_locked_no_pdf(api):
    r = api.get(f"{BASE_URL}/api/books")
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list) and len(items) > 0
    for b in items:
        assert b.get("locked") is True, f"book not locked: {b.get('id')}"
        assert "pdf_url" not in b, f"pdf_url leaked for {b.get('id')}"


def test_home_feed_non_empty(api):
    # WP can cold-start; retry a couple of times.
    import time
    body = {}
    for _ in range(3):
        r = api.get(f"{BASE_URL}/api/wp/home-feed")
        assert r.status_code == 200, r.text
        body = r.json()
        if body.get("hero"):
            break
        time.sleep(2)
    assert body.get("hero"), f"home-feed hero missing after retries: {body}"


def test_guides_public(api):
    r = api.get(f"{BASE_URL}/api/guides")
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list) and len(items) > 0
    # guides should NOT be locked and should carry pdf_url
    assert items[0].get("pdf_url"), "guide missing pdf_url"
    assert not items[0].get("locked"), "guide unexpectedly locked"


# ---- 6. Data-purge verification ----
def test_bookmarks_are_purged_on_account_delete(api):
    email = _unique_email("purge")
    password = "changeme123"

    # register #1
    r1 = api.post(f"{BASE_URL}/api/auth/register", json={
        "first_name": "Purge", "last_name": "Test",
        "email": email, "phone": "+15551234", "password": password,
    })
    assert r1.status_code == 201, r1.text
    t1 = r1.json()["session_token"]
    uid1 = r1.json()["user"]["user_id"]

    # add a bookmark
    r_bm = api.post(
        f"{BASE_URL}/api/user/bookmarks",
        headers={"Authorization": f"Bearer {t1}"},
        json={"post_id": "book-3d-retirement-income", "title": "Test", "type": "book"},
    )
    assert r_bm.status_code == 200, r_bm.text

    # confirm it's there
    r_list = api.get(
        f"{BASE_URL}/api/user/bookmarks",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert r_list.status_code == 200
    assert len(r_list.json()) == 1

    # DELETE account
    r_del = api.delete(
        f"{BASE_URL}/api/auth/account",
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert r_del.status_code == 200

    # register the same email again
    r2 = api.post(f"{BASE_URL}/api/auth/register", json={
        "first_name": "Purge", "last_name": "Two",
        "email": email, "phone": "+15551234", "password": password,
    })
    assert r2.status_code == 201, r2.text
    uid2 = r2.json()["user"]["user_id"]
    t2 = r2.json()["session_token"]

    # New user_id must differ from the deleted one
    assert uid2 != uid1, "re-registered user reused old user_id"

    # bookmarks must be empty for the new user
    r_list2 = api.get(
        f"{BASE_URL}/api/user/bookmarks",
        headers={"Authorization": f"Bearer {t2}"},
    )
    assert r_list2.status_code == 200
    assert r_list2.json() == [], f"bookmarks were not purged: {r_list2.json()}"

    # cleanup
    api.delete(
        f"{BASE_URL}/api/auth/account",
        headers={"Authorization": f"Bearer {t2}"},
    )
