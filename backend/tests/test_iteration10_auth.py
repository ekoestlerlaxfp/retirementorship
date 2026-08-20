"""Iteration 10 — Custom email/password auth flow tests.

Covers /api/auth/{register,verify,resend-code,login,forgot-password,
reset-password,me,logout} plus a session-passthrough check via
/api/user/bookmarks (proves require_user still accepts the new bearer token).

We DO NOT send real email — outbound Resend calls are disabled at the
process level by blanking EMERGENT_EMAIL_KEY before this suite runs (see
the shell wrapper in the test report). The backend's _send_verification /
_send_reset helpers already swallow email failures, so a fresh 6-digit
code is written to `db.user_verification_codes` regardless. We recover
the code by brute-forcing sha256(000000..999999) against `code_hash`.
"""
import os
import uuid
import hashlib
import time
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ---- helpers ----
def _uniq_email() -> str:
    return f"qa+{uuid.uuid4().hex[:10]}@retirementorship.test"


def _mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


async def _fetch_code(email: str, purpose: str = "verify") -> str:
    db = _mongo()
    u = await db.users.find_one({"email": email})
    assert u, f"user not found: {email}"
    rec = None
    for _ in range(15):
        rec = await db.user_verification_codes.find_one(
            {"user_id": u["user_id"], "purpose": purpose, "consumed": False},
            sort=[("created_at", -1)],
        )
        if rec:
            break
        await asyncio.sleep(0.3)
    assert rec, f"no verification code found for {email} ({purpose})"
    target = rec["code_hash"]
    for n in range(1_000_000):
        if hashlib.sha256(f"{n:06d}".encode()).hexdigest() == target:
            return f"{n:06d}"
    raise AssertionError("code hash brute force failed")


def fetch_code(email: str, purpose: str = "verify") -> str:
    return asyncio.get_event_loop().run_until_complete(_fetch_code(email, purpose))


async def _cleanup_email(email: str):
    db = _mongo()
    u = await db.users.find_one({"email": email})
    if not u:
        return
    uid = u["user_id"]
    await db.users.delete_many({"user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.user_verification_codes.delete_many({"user_id": uid})
    await db.bookmarks.delete_many({"user_id": uid})
    await db.history.delete_many({"user_id": uid})
    await db.login_attempts.delete_many({"key": f"email:{email}"})


def cleanup(email: str):
    asyncio.get_event_loop().run_until_complete(_cleanup_email(email))


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ============ REGISTER ============
class TestRegister:
    def test_register_success_returns_user_and_verification_flag(self, api):
        email = _uniq_email()
        try:
            r = api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "Ada", "last_name": "Lovelace",
                "email": email, "phone": "+1 555 000 0001",
                "password": "supersecret123",
            })
            assert r.status_code == 201, r.text
            body = r.json()
            assert body["verification_required"] is True
            u = body["user"]
            assert u["email"] == email
            assert u["first_name"] == "Ada"
            assert u["verified"] is False
            assert u["user_id"].startswith("user_")
            # session_token must NOT be issued yet
            assert "session_token" not in body
        finally:
            cleanup(email)

    def test_register_duplicate_email_returns_409(self, api):
        email = _uniq_email()
        payload = {"first_name": "A", "last_name": "B", "email": email,
                   "phone": "+1", "password": "pw12345678"}
        try:
            r1 = api.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert r1.status_code == 201
            r2 = api.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert r2.status_code == 409
            assert "already exists" in r2.json()["detail"].lower()
        finally:
            cleanup(email)

    def test_register_short_password_422(self, api):
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "first_name": "A", "last_name": "B",
            "email": _uniq_email(), "phone": "1", "password": "short",
        })
        assert r.status_code == 422

    def test_register_invalid_email_422(self, api):
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "first_name": "A", "last_name": "B",
            "email": "not-an-email", "phone": "1", "password": "pw12345678",
        })
        # Pydantic passes (min_length=3), then _norm_email rejects → 422
        assert r.status_code == 422

    def test_register_missing_fields_422(self, api):
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": _uniq_email(), "password": "pw12345678",
        })
        assert r.status_code == 422


# ============ VERIFY ============
class TestVerify:
    def test_verify_wrong_code_returns_400(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            r = api.post(f"{BASE_URL}/api/auth/verify", json={
                "email": email, "code": "000000",
            })
            # It may accidentally hit the real code (1-in-1M) but effectively 400
            assert r.status_code == 400
        finally:
            cleanup(email)

    def test_verify_success_issues_session(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "Ada", "last_name": "L", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            code = fetch_code(email, "verify")
            r = api.post(f"{BASE_URL}/api/auth/verify",
                         json={"email": email, "code": code})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["session_token"]
            assert body["user"]["verified"] is True
            # /me works with the token
            me = api.get(f"{BASE_URL}/api/auth/me", headers={
                "Authorization": f"Bearer {body['session_token']}",
            })
            assert me.status_code == 200
            assert me.json()["user"]["email"] == email
        finally:
            cleanup(email)

    def test_verify_five_wrong_attempts_locks_code(self, api):
        """After 5 wrong attempts, even the CORRECT code is rejected."""
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            correct = fetch_code(email, "verify")
            wrong = "000000" if correct != "000000" else "111111"
            # 5 bad attempts
            for _ in range(5):
                r = api.post(f"{BASE_URL}/api/auth/verify",
                             json={"email": email, "code": wrong})
                assert r.status_code == 400
            # Now the correct code should ALSO 400
            r_good = api.post(f"{BASE_URL}/api/auth/verify",
                              json={"email": email, "code": correct})
            assert r_good.status_code == 400, r_good.text
        finally:
            cleanup(email)


# ============ RESEND CODE ============
class TestResendCode:
    def test_resend_unknown_email_ok_true(self, api):
        r = api.post(f"{BASE_URL}/api/auth/resend-code",
                     json={"email": _uniq_email()})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_resend_within_cooldown_still_ok(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            # register just issued a code; another resend within 30s → still ok
            r = api.post(f"{BASE_URL}/api/auth/resend-code",
                         json={"email": email})
            assert r.status_code == 200
            assert r.json() == {"ok": True}
        finally:
            cleanup(email)


# ============ LOGIN ============
class TestLogin:
    def test_login_unverified_returns_403(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            r = api.post(f"{BASE_URL}/api/auth/login",
                         json={"email": email, "password": "pw12345678"})
            assert r.status_code == 403
            assert "verify" in r.json()["detail"].lower()
        finally:
            cleanup(email)

    def test_login_wrong_password_returns_401(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            code = fetch_code(email, "verify")
            api.post(f"{BASE_URL}/api/auth/verify",
                     json={"email": email, "code": code})
            r = api.post(f"{BASE_URL}/api/auth/login",
                         json={"email": email, "password": "WRONG-nope-1"})
            assert r.status_code == 401
        finally:
            cleanup(email)

    def test_login_verified_returns_session(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "Ada", "last_name": "L", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            code = fetch_code(email, "verify")
            api.post(f"{BASE_URL}/api/auth/verify",
                     json={"email": email, "code": code})
            r = api.post(f"{BASE_URL}/api/auth/login",
                         json={"email": email, "password": "pw12345678"})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["session_token"]
            assert body["user"]["verified"] is True
        finally:
            cleanup(email)

    def test_login_five_bad_attempts_locks_out_429(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            code = fetch_code(email, "verify")
            api.post(f"{BASE_URL}/api/auth/verify",
                     json={"email": email, "code": code})
            # 5 wrong attempts
            for _ in range(5):
                api.post(f"{BASE_URL}/api/auth/login",
                         json={"email": email, "password": "WRONG-nope"})
            # 6th attempt (even with correct pw) → 429
            r = api.post(f"{BASE_URL}/api/auth/login",
                         json={"email": email, "password": "pw12345678"})
            assert r.status_code == 429, r.text
        finally:
            cleanup(email)


# ============ FORGOT + RESET ============
class TestForgotReset:
    def test_forgot_unknown_email_ok(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password",
                     json={"email": _uniq_email()})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_reset_flow_end_to_end(self, api):
        email = _uniq_email()
        try:
            # Register + verify
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            v_code = fetch_code(email, "verify")
            first_login = api.post(f"{BASE_URL}/api/auth/verify",
                                   json={"email": email, "code": v_code})
            old_token = first_login.json()["session_token"]

            # Forgot → new reset code
            r = api.post(f"{BASE_URL}/api/auth/forgot-password",
                         json={"email": email})
            assert r.status_code == 200
            reset_code = fetch_code(email, "reset")
            new_pw = "NewPassword!42"
            r2 = api.post(f"{BASE_URL}/api/auth/reset-password", json={
                "email": email, "code": reset_code, "password": new_pw,
            })
            assert r2.status_code == 200, r2.text
            body = r2.json()
            assert body["session_token"]
            assert body["session_token"] != old_token
            # Old token must be revoked
            me_old = api.get(f"{BASE_URL}/api/auth/me",
                             headers={"Authorization": f"Bearer {old_token}"})
            assert me_old.status_code == 401
            # New password works
            login2 = api.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": new_pw})
            assert login2.status_code == 200
        finally:
            cleanup(email)


# ============ ME + LOGOUT + BOOKMARK PASSTHROUGH ============
class TestMeLogoutAndBookmark:
    def test_me_without_token_401(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_logout_invalidates_token_and_bookmark_uses_new_session(self, api):
        email = _uniq_email()
        try:
            api.post(f"{BASE_URL}/api/auth/register", json={
                "first_name": "A", "last_name": "B", "email": email,
                "phone": "1", "password": "pw12345678",
            })
            code = fetch_code(email, "verify")
            body = api.post(f"{BASE_URL}/api/auth/verify",
                            json={"email": email, "code": code}).json()
            tok = body["session_token"]
            auth = {"Authorization": f"Bearer {tok}"}

            # POST /api/user/bookmarks — proves require_user accepts new bearer
            r = api.post(f"{BASE_URL}/api/user/bookmarks",
                         headers=auth,
                         json={"post_id": "test-auth-book",
                               "title": "Auth Bookmark Test",
                               "type": "article",
                               "category": "test"})
            assert r.status_code == 200, r.text
            listing = api.get(f"{BASE_URL}/api/user/bookmarks", headers=auth)
            assert listing.status_code == 200
            assert any(b["post_id"] == "test-auth-book"
                       for b in listing.json())

            # Logout
            lo = api.post(f"{BASE_URL}/api/auth/logout", headers=auth)
            assert lo.status_code == 200

            # /me now 401
            me = api.get(f"{BASE_URL}/api/auth/me", headers=auth)
            assert me.status_code == 401

            # Bookmark endpoint also 401
            bm = api.get(f"{BASE_URL}/api/user/bookmarks", headers=auth)
            assert bm.status_code == 401
        finally:
            cleanup(email)
