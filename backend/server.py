from fastapi import FastAPI, APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import asyncio
import time
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone, timedelta
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

WP_BASE = "https://retirementorship.com/wp-json/wp/v2"

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="RetireMentorship API")
api_router = APIRouter(prefix="/api")

# ---- simple in-process cache for WP responses ----
_cache: Dict[str, tuple[float, Any]] = {}
CACHE_TTL = 180  # 3 min — WordPress is the source of truth; keep it fresh

ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
LEADS_WEBHOOK_URL = os.environ.get("LEADS_WEBHOOK_URL", "")


async def wp_get(path: str, params: Optional[dict] = None, ttl: int = CACHE_TTL) -> Any:
    key = f"{path}?{sorted((params or {}).items())}"
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    headers = {"User-Agent": "RetireMentorship/1.0 (mobile app)"}
    async with httpx.AsyncClient(timeout=20.0, headers=headers) as hc:
        for attempt in range(3):
            try:
                r = await hc.get(f"{WP_BASE}{path}", params=params)
                if r.status_code == 429:
                    # rate limited — serve stale if we have any, else backoff
                    if hit:
                        _cache[key] = (now, hit[1])
                        return hit[1]
                    await asyncio.sleep(1.0 * (attempt + 1))
                    continue
                r.raise_for_status()
                data = r.json()
                _cache[key] = (now, data)
                return data
            except httpx.HTTPStatusError as e:
                if hit:
                    return hit[1]
                if attempt == 2:
                    logger.warning(f"WP {path} failed: {e}")
                    return [] if not path.endswith(tuple(f"/{i}" for i in range(10))) else {}
                await asyncio.sleep(0.5)
            except Exception as e:
                if hit:
                    return hit[1]
                if attempt == 2:
                    logger.warning(f"WP {path} error: {e}")
                    return []
                await asyncio.sleep(0.5)
    return []


# ---- helpers ----
import html as _html


def strip_html(s: str) -> str:
    if not s:
        return ""
    text = re.sub(r"<[^>]+>", "", s)
    return _html.unescape(text).replace("\u00a0", " ").strip()


import re as _re

_YT_PATTERNS = (
    _re.compile(r"youtube\.com/embed/([A-Za-z0-9_-]{6,})", _re.IGNORECASE),
    _re.compile(r"youtu\.be/([A-Za-z0-9_-]{6,})", _re.IGNORECASE),
    _re.compile(r"youtube\.com/watch\?[^\"'\s]*[?&]?v=([A-Za-z0-9_-]{6,})", _re.IGNORECASE),
    _re.compile(r"youtube-nocookie\.com/embed/([A-Za-z0-9_-]{6,})", _re.IGNORECASE),
)
_VIMEO_RE = _re.compile(r"player\.vimeo\.com/video/(\d+)", _re.IGNORECASE)


def _extract_video(content_html: str) -> tuple[Optional[str], Optional[str]]:
    """Return (kind, id) from the WP content HTML. Kind is 'youtube' or 'vimeo'."""
    if not content_html:
        return (None, None)
    for pat in _YT_PATTERNS:
        m = pat.search(content_html)
        if m:
            return ("youtube", m.group(1))
    m = _VIMEO_RE.search(content_html)
    if m:
        return ("vimeo", m.group(1))
    return (None, None)


def transform_post(p: dict) -> dict:
    embedded = p.get("_embedded", {}) or {}
    featured = (embedded.get("wp:featuredmedia") or [{}])[0] or {}
    terms = embedded.get("wp:term") or []
    category = None
    for group in terms:
        for t in group:
            if t.get("taxonomy") == "category":
                category = {"id": t.get("id"), "name": _html.unescape(t.get("name") or ""), "slug": t.get("slug")}
                break
        if category:
            break
    author = (embedded.get("author") or [{}])[0] or {}
    title = strip_html((p.get("title") or {}).get("rendered", ""))
    excerpt = strip_html((p.get("excerpt") or {}).get("rendered", ""))
    content_html = (p.get("content") or {}).get("rendered", "")
    words = len(strip_html(content_html).split()) if content_html else 0
    reading_time = max(1, round(words / 220))
    video_kind, video_id = _extract_video(content_html)
    is_video = video_kind is not None
    return {
        "id": p.get("id"),
        "slug": p.get("slug"),
        "title": title,
        "excerpt": excerpt,
        "content_html": content_html,
        "date": p.get("date"),
        "modified": p.get("modified"),
        "link": p.get("link"),
        "image": featured.get("source_url"),
        "image_alt": featured.get("alt_text") or title,
        "category": category,
        "author": {"name": author.get("name"), "avatar": (author.get("avatar_urls") or {}).get("96")},
        "reading_time": reading_time,
        "type": "video" if is_video else "article",
        "video_kind": video_kind,
        "video_id": video_id,
    }


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- Models ----
class RegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=8, max_length=72)
    retirement_stage: Optional[str] = None


class VerifyIn(BaseModel):
    email: str
    code: str = Field(pattern=r"^\d{6}$")


class ResendCodeIn(BaseModel):
    email: str


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    email: str
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=72)


class UserOut(BaseModel):
    user_id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    verified: bool = False
    retirement_stage: Optional[str] = None


class OnboardingIn(BaseModel):
    retirement_stage: str  # "10+" | "5-10" | "0-5" | "retired"


class BookmarkIn(BaseModel):
    post_id: str
    title: str
    image: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = "article"


class HistoryIn(BaseModel):
    post_id: str
    title: str
    image: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = "article"
    progress: Optional[float] = 0.0  # 0..1


# ---- Auth helpers ----
import secrets
import hashlib
from passlib.context import CryptContext
from emailer import send_verification_email, send_password_reset_email

_pwd = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
    bcrypt__truncate_error=True,
)

SESSION_TTL_DAYS = 30
CODE_TTL_MINUTES = 10
LOGIN_LOCK_WINDOW_MIN = 15
LOGIN_LOCK_THRESHOLD = 5
RESEND_COOLDOWN_SEC = 30


def _hash_pw(p: str) -> str:
    return _pwd.hash(p)


def _verify_pw(p: str, h: str) -> bool:
    try:
        return _pwd.verify(p, h)
    except Exception:
        return False


def _digest(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def _new_token() -> str:
    return secrets.token_urlsafe(48)


def _new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _norm_email(e: str) -> str:
    e = (e or "").strip().lower()
    if not _EMAIL_RE.match(e):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    return e


def _public_user(u: dict) -> dict:
    return {
        "user_id": u.get("user_id"),
        "email": u.get("email"),
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "phone": u.get("phone"),
        "verified": bool(u.get("verified")),
        "retirement_stage": u.get("retirement_stage"),
        # Compatibility with older frontend fields
        "name": (f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                 or u.get("email")),
        "picture": None,
    }


async def get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.user_sessions.find_one(
        {"token_hash": _digest(token), "revoked_at": None},
        {"_id": 0},
    )
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < utcnow():
            return None
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    return user


async def require_user(authorization: Optional[str]) -> dict:
    user = await get_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def _issue_session(user_id: str) -> str:
    raw = _new_token()
    created = utcnow()
    await db.user_sessions.insert_one({
        "token_hash": _digest(raw),
        "user_id": user_id,
        "created_at": created,
        "expires_at": created + timedelta(days=SESSION_TTL_DAYS),
        "revoked_at": None,
    })
    return raw


async def _login_locked(email_key: str) -> bool:
    rec = await db.login_attempts.find_one({"key": email_key})
    if not rec:
        return False
    locked_until = rec.get("locked_until")
    if locked_until:
        if isinstance(locked_until, datetime):
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > utcnow():
                return True
    window = rec.get("window_started_at")
    if isinstance(window, datetime):
        if window.tzinfo is None:
            window = window.replace(tzinfo=timezone.utc)
        if utcnow() - window >= timedelta(minutes=LOGIN_LOCK_WINDOW_MIN):
            await db.login_attempts.delete_one({"_id": rec["_id"]})
    return False


async def _bad_login(email_key: str):
    t = utcnow()
    rec = await db.login_attempts.find_one({"key": email_key})
    if not rec:
        await db.login_attempts.insert_one({
            "key": email_key, "failures": 1, "window_started_at": t, "locked_until": None,
        })
        return
    window = rec.get("window_started_at")
    if isinstance(window, datetime):
        if window.tzinfo is None:
            window = window.replace(tzinfo=timezone.utc)
        if t - window >= timedelta(minutes=LOGIN_LOCK_WINDOW_MIN):
            await db.login_attempts.update_one(
                {"_id": rec["_id"]},
                {"$set": {"failures": 1, "window_started_at": t, "locked_until": None}},
            )
            return
    n = int(rec.get("failures", 0)) + 1
    lock = t + timedelta(minutes=LOGIN_LOCK_WINDOW_MIN) if n >= LOGIN_LOCK_THRESHOLD else None
    await db.login_attempts.update_one(
        {"_id": rec["_id"]},
        {"$set": {"failures": n, "locked_until": lock}},
    )


async def _clear_login_attempts(email_key: str):
    await db.login_attempts.delete_one({"key": email_key})


async def _fire_leads_webhook(user: dict):
    """Fire-and-forget lead webhook so advisors get the new signup."""
    if not LEADS_WEBHOOK_URL:
        return
    try:
        created = user.get("created_at")
        payload = {
            "email": user.get("email"),
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "phone": user.get("phone"),
            "name": (f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
                     or user.get("email")),
            "user_id": user.get("user_id"),
            "retirement_stage": user.get("retirement_stage"),
            "created_at": created.isoformat() if isinstance(created, datetime) else created,
            "source": user.get("source", "email"),
        }
        async with httpx.AsyncClient(timeout=10.0) as hc:
            await hc.post(LEADS_WEBHOOK_URL, json=payload)
    except Exception as e:
        logger.warning(f"Leads webhook failed: {e}")


async def _send_verification(user: dict) -> bool:
    """Generate a fresh 6-digit code, invalidate old ones, and email it.
    Returns True if the email service accepted the send, False otherwise.
    """
    email = user["email"]
    code = _new_code()
    t = utcnow()
    await db.user_verification_codes.update_many(
        {"user_id": user["user_id"], "purpose": "verify", "consumed": False},
        {"$set": {"consumed": True}},
    )
    await db.user_verification_codes.insert_one({
        "user_id": user["user_id"],
        "email": email,
        "purpose": "verify",
        "code_hash": _digest(code),
        "created_at": t,
        "expires_at": t + timedelta(minutes=CODE_TTL_MINUTES),
        "attempts": 0,
        "consumed": False,
    })
    try:
        await send_verification_email(to=email, first_name=user.get("first_name") or "there", code=code)
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"last_email_status": "sent", "last_email_at": utcnow(), "last_email_error": None}},
        )
        return True
    except httpx.HTTPStatusError as e:
        err = f"HTTP {e.response.status_code} {e.response.text[:200]}"
        logger.error(f"send_verification_email failed for {email}: {err}")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"last_email_status": "failed", "last_email_at": utcnow(), "last_email_error": err}},
        )
        return False
    except Exception as e:
        logger.error(f"send_verification_email failed for {email}: {e}")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"last_email_status": "failed", "last_email_at": utcnow(), "last_email_error": str(e)[:200]}},
        )
        return False


async def _send_reset(user: dict) -> bool:
    email = user["email"]
    code = _new_code()
    t = utcnow()
    await db.user_verification_codes.update_many(
        {"user_id": user["user_id"], "purpose": "reset", "consumed": False},
        {"$set": {"consumed": True}},
    )
    await db.user_verification_codes.insert_one({
        "user_id": user["user_id"],
        "email": email,
        "purpose": "reset",
        "code_hash": _digest(code),
        "created_at": t,
        "expires_at": t + timedelta(minutes=CODE_TTL_MINUTES),
        "attempts": 0,
        "consumed": False,
    })
    try:
        await send_password_reset_email(to=email, first_name=user.get("first_name") or "there", code=code)
        return True
    except Exception as e:
        logger.error(f"send_password_reset_email failed for {email}: {e}")
        return False


# ---- Auth routes ----
@api_router.post("/auth/register", status_code=201)
async def auth_register(payload: RegisterIn):
    email = _norm_email(payload.email)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now_ = utcnow()
    doc = {
        "user_id": user_id,
        "email": email,
        "first_name": payload.first_name.strip(),
        "last_name": payload.last_name.strip(),
        "phone": payload.phone.strip(),
        "password_hash": _hash_pw(payload.password),
        "verified": True,  # verification removed — accounts are active immediately
        "retirement_stage": payload.retirement_stage,
        "source": "email",
        "created_at": now_,
        "last_login": now_,
    }
    try:
        await db.users.insert_one(doc)
    except Exception:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    # Fire the lead webhook so advisors get the new signup (non-blocking).
    asyncio.create_task(_fire_leads_webhook(doc))

    # Issue a session so the user is signed in immediately.
    token = await _issue_session(user_id)
    return {"session_token": token, "user": _public_user(doc)}


@api_router.post("/auth/verify")
async def auth_verify(payload: VerifyIn):
    """Legacy endpoint — email verification has been removed. Signs the user in if the email exists.
    Kept for backwards compatibility so any in-flight app installs still work."""
    email = _norm_email(payload.email)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Account not found.")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"verified": True, "last_login": utcnow()}})
    token = await _issue_session(user["user_id"])
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"session_token": token, "user": _public_user(fresh)}


@api_router.post("/auth/resend-code")
async def auth_resend_code(payload: ResendCodeIn):
    """Legacy no-op — email verification has been removed."""
    _norm_email(payload.email)
    return {"ok": True, "sent": True, "verification_disabled": True}


@api_router.post("/auth/login")
async def auth_login(payload: LoginIn):
    email = _norm_email(payload.email)
    key = f"email:{email}"
    if await _login_locked(key):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    ok = bool(user) and _verify_pw(payload.password, user.get("password_hash") or "")
    if not ok:
        await _bad_login(key)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    await _clear_login_attempts(key)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_login": utcnow()}})
    token = await _issue_session(user["user_id"])
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"session_token": token, "user": _public_user(fresh)}


@api_router.post("/auth/forgot-password")
async def auth_forgot(payload: ForgotIn):
    email = _norm_email(payload.email)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        await _send_reset(user)
    return {"ok": True}


@api_router.post("/auth/reset-password")
async def auth_reset(payload: ResetIn):
    email = _norm_email(payload.email)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    rec = None
    if user:
        rec = await db.user_verification_codes.find_one(
            {"user_id": user["user_id"], "purpose": "reset", "consumed": False},
            sort=[("created_at", -1)],
        )
    now_ = utcnow()
    if not user or not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    exp = rec["expires_at"]
    if isinstance(exp, datetime) and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_ or rec.get("attempts", 0) >= 5 or not secrets.compare_digest(rec["code_hash"], _digest(payload.code)):
        await db.user_verification_codes.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": _hash_pw(payload.password), "verified": True}},
    )
    await db.user_verification_codes.update_one({"_id": rec["_id"]}, {"$set": {"consumed": True}})
    # Revoke every existing session so the user has to log in again.
    await db.user_sessions.update_many(
        {"user_id": user["user_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_}},
    )
    token = await _issue_session(user["user_id"])
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"session_token": token, "user": _public_user(fresh)}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    return {"user": _public_user(user)}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.update_one(
            {"token_hash": _digest(token), "revoked_at": None},
            {"$set": {"revoked_at": utcnow()}},
        )
    return {"ok": True}


# ---- WP proxy ----
@api_router.get("/wp/categories")
async def wp_categories():
    data = await wp_get("/categories", {"per_page": 100})
    if not isinstance(data, list):
        return []
    # Sort by count desc client-side; filter out empty
    filtered = [c for c in data if c.get("count", 0) > 0]
    filtered.sort(key=lambda c: c.get("count", 0), reverse=True)
    return [{"id": c["id"], "name": _html.unescape(c["name"] or ""), "slug": c["slug"], "count": c.get("count", 0)} for c in filtered]


@api_router.get("/wp/posts")
async def wp_posts(
    page: int = 1,
    per_page: int = 10,
    category: Optional[int] = None,
    search: Optional[str] = None,
):
    params: Dict[str, Any] = {"page": page, "per_page": min(per_page, 50), "_embed": 1}
    if category:
        params["categories"] = category
    if search:
        params["search"] = search
    data = await wp_get("/posts", params)
    if not isinstance(data, list):
        data = []
    # If search returned nothing (WP may 429 into empty), retry once after a short delay
    if search and not data:
        await asyncio.sleep(1.5)
        data = await wp_get("/posts", params, ttl=60)
        if not isinstance(data, list):
            data = []
    return [transform_post(p) for p in data]


async def _wp_get_total(params: Dict[str, Any], cache_key: str) -> int:
    """Fetch X-WP-Total for the given params with a short TTL cache + retry so
    WP cold-start rate limits don't silently return 0.
    """
    now = time.time()
    entry = _cache.get(cache_key)
    if entry and entry[0] > now:
        return entry[1]
    headers = {"User-Agent": "RetireMentorship/1.0 (mobile app)"}
    last_total = 0
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=headers) as hc:
                r = await hc.get(f"{WP_BASE}/posts", params=params)
                if r.status_code == 200:
                    total = int(r.headers.get("X-WP-Total", "0"))
                    if total > 0:
                        _cache[cache_key] = (now + 120, total)
                        return total
                    # Received 200 but X-WP-Total=0 — could be a genuine no-match
                    # OR a WP hiccup. Retry with backoff a couple of times.
                    last_total = total
                    if attempt < 2:
                        await asyncio.sleep(0.8 * (attempt + 1))
                        continue
                    _cache[cache_key] = (now + 30, total)  # short cache — may still be a hiccup
                    return total
                elif r.status_code in (429, 503):
                    await asyncio.sleep(0.8 * (attempt + 1))
                    continue
                else:
                    logger.warning(f"wp total unexpected {r.status_code}: {r.text[:120]}")
                    return 0
        except Exception as e:
            logger.warning(f"wp total attempt {attempt+1} failed: {e}")
            await asyncio.sleep(0.5)
    return last_total


@api_router.get("/wp/posts/count")
async def wp_posts_count(
    category: Optional[int] = None,
    search: Optional[str] = None,
):
    """Return the total post count matching an optional search + category so the
    search UI can show "20 of 53 shown"."""
    params: Dict[str, Any] = {"per_page": 1}
    if category:
        params["categories"] = category
    if search:
        params["search"] = search
    cache_key = f"/posts/count?{sorted(params.items())}"
    total = await _wp_get_total(params, cache_key)
    return {"total": total}


@api_router.get("/wp/posts/{post_id}")
async def wp_post(post_id: int):
    data = await wp_get(f"/posts/{post_id}", {"_embed": 1})
    return transform_post(data)


@api_router.get("/wp/home-feed")
async def wp_home_feed(
    stage: Optional[str] = None,
    exclude_ids: Optional[str] = None,
    interest_cat: Optional[int] = None,
):
    """Home feed with cross-rail de-duplication.
    - hero: latest post
    - tip: 2nd latest (never duplicates hero)
    - videos: newest posts with video embeds, excluding hero
    - trending: mid-slice of latest, excluding hero/videos
    - recommended: page-2 posts filtered by interest_cat + exclude_ids (viewing history)
    """
    latest_data = await wp_get(
        "/posts",
        {"per_page": 20, "_embed": 1, "orderby": "date", "order": "desc"},
    )
    if not isinstance(latest_data, list):
        latest_data = []
    latest_posts = [transform_post(p) for p in latest_data]

    exclude_set = set()
    if exclude_ids:
        for tok in exclude_ids.split(","):
            tok = tok.strip()
            if tok.isdigit():
                exclude_set.add(int(tok))

    # Hero = the newest post the user hasn't already engaged with.
    hero = next((p for p in latest_posts if p["id"] not in exclude_set), None)
    if hero:
        exclude_set.add(hero["id"])

    tip = None
    for p in latest_posts[1:]:
        if p["id"] not in exclude_set and p["type"] == "article":
            tip = p
            exclude_set.add(p["id"])
            break
    if not tip:
        for p in latest_posts[1:]:
            if p["id"] not in exclude_set:
                tip = p
                exclude_set.add(p["id"])
                break

    videos = []
    for p in latest_posts:
        if p["type"] == "video" and p["id"] not in exclude_set:
            videos.append(p)
            if len(videos) >= 8:
                break
    for v in videos:
        exclude_set.add(v["id"])

    trending = [p for p in latest_posts if p["id"] not in exclude_set][:8]
    for t in trending:
        exclude_set.add(t["id"])

    # Recommended = deeper picks, biased to user interest.
    rec_params: Dict[str, Any] = {"per_page": 12, "_embed": 1, "orderby": "date", "order": "desc"}
    if interest_cat:
        rec_params["categories"] = interest_cat
    else:
        rec_params["page"] = 2  # go one page deeper into WP's archive for freshness without duplication
    rec_data = await wp_get("/posts", rec_params, ttl=180)
    if not isinstance(rec_data, list):
        rec_data = []
    recommended = [transform_post(p) for p in rec_data if isinstance(p, dict) and p.get("id") not in exclude_set][:8]
    # If still empty (interest_cat had nothing new), fall back to page 2 raw
    if not recommended and interest_cat:
        rec_params.pop("categories", None)
        rec_params["page"] = 2
        rec_data = await wp_get("/posts", rec_params, ttl=180)
        if isinstance(rec_data, list):
            recommended = [transform_post(p) for p in rec_data if isinstance(p, dict) and p.get("id") not in exclude_set][:8]

    return {
        "hero": hero,
        "featured": [hero] if hero else [],
        "latest": latest_posts[:10],  # kept for backwards-compat; not rendered on Home anymore
        "videos": videos,
        "trending": trending,
        "recommended": recommended,
        "tip": tip,
        "stage": stage,
    }


# ---- User data ----
@api_router.post("/user/onboarding")
async def user_onboarding(payload: OnboardingIn, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"retirement_stage": payload.retirement_stage}})
    user["retirement_stage"] = payload.retirement_stage
    return {"user": user}


@api_router.get("/user/bookmarks")
async def user_bookmarks_list(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    docs = await db.bookmarks.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.post("/user/bookmarks")
async def user_bookmark_add(payload: BookmarkIn, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    doc = {
        "user_id": user["user_id"],
        "post_id": payload.post_id,
        "title": payload.title,
        "image": payload.image,
        "category": payload.category,
        "type": payload.type,
        "created_at": utcnow(),
    }
    await db.bookmarks.update_one(
        {"user_id": user["user_id"], "post_id": payload.post_id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/user/bookmarks/{post_id}")
async def user_bookmark_remove(post_id: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    await db.bookmarks.delete_one({"user_id": user["user_id"], "post_id": post_id})
    return {"ok": True}


@api_router.get("/user/bookmarks/ids")
async def user_bookmark_ids(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    docs = await db.bookmarks.find({"user_id": user["user_id"]}, {"_id": 0, "post_id": 1}).to_list(1000)
    return [d["post_id"] for d in docs]


@api_router.get("/user/history")
async def user_history_list(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    docs = await db.history.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).limit(50).to_list(50)
    return docs


@api_router.post("/user/history")
async def user_history_add(payload: HistoryIn, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    prog = float(payload.progress or 0.0)
    doc = {
        "user_id": user["user_id"],
        "post_id": payload.post_id,
        "title": payload.title,
        "image": payload.image,
        "category": payload.category,
        "type": payload.type,
        "progress": prog,
        "completed": prog >= 0.99,
        "updated_at": utcnow(),
    }
    await db.history.update_one(
        {"user_id": user["user_id"], "post_id": payload.post_id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/user/completed/ids")
async def user_completed_ids(authorization: Optional[str] = Header(None)):
    """Fast list of post_ids the user has marked complete — used to decorate cards."""
    user = await require_user(authorization)
    docs = await db.history.find(
        {"user_id": user["user_id"], "$or": [{"completed": True}, {"progress": {"$gte": 0.99}}]},
        {"_id": 0, "post_id": 1},
    ).to_list(2000)
    return [d["post_id"] for d in docs]


class FeedbackIn(BaseModel):
    question: str = Field(min_length=3, max_length=4000)


@api_router.post("/user/feedback")
async def user_feedback(payload: FeedbackIn, authorization: Optional[str] = Header(None)):
    """Send the signed-in user's question to the RetireMentorship team inbox."""
    user = await require_user(authorization)
    from emailer import send_email
    from html import escape as _esc

    full_name = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip() or (user.get("email") or "A RetireMentorship reader")
    email = user.get("email") or ""
    phone = user.get("phone") or ""
    stage = user.get("retirement_stage") or "not specified"
    question = payload.question.strip()

    subject = f"New question from {full_name}"
    body_lines = _esc(question).replace("\n", "<br>")
    inner = (
        f'<p><strong>{_esc(full_name)}</strong> asked a question through the app:</p>'
        f'<blockquote style="border-left:4px solid #4B3166;padding:8px 16px;margin:16px 0;'
        f'background:#F0E7D2;border-radius:8px;color:#231F20;font-size:15px;line-height:22px">'
        f'{body_lines}</blockquote>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px;color:#4B3166">'
        f'<tr><td style="padding:4px 12px 4px 0;color:#8B7B63">Email</td>'
        f'<td style="padding:4px 0">{_esc(email)}</td></tr>'
        f'<tr><td style="padding:4px 12px 4px 0;color:#8B7B63">Phone</td>'
        f'<td style="padding:4px 0">{_esc(phone) or "&mdash;"}</td></tr>'
        f'<tr><td style="padding:4px 12px 4px 0;color:#8B7B63">Retirement stage</td>'
        f'<td style="padding:4px 0">{_esc(stage)}</td></tr>'
        f'</table>'
    )
    # Reuse the branded chrome from emailer._wrap
    from emailer import _wrap
    html = _wrap(inner, footer_note=f"Sent from the {os.environ.get('EMAIL_FROM_NAME','RetireMentorship')} mobile app on behalf of a reader.")

    try:
        await send_email(
            to="ekoestler@laxfp.com",
            subject=subject,
            html=html,
            reply_to=email or None,
        )
    except Exception as e:
        logger.error(f"Feedback email failed: {e}")
        raise HTTPException(status_code=502, detail="We couldn't send your question right now — please try again in a minute.")

    # Log the feedback for auditability
    try:
        await db.feedback.insert_one({
            "user_id": user["user_id"],
            "email": email,
            "full_name": full_name,
            "phone": phone,
            "retirement_stage": stage,
            "question": question,
            "created_at": utcnow(),
        })
    except Exception:
        pass

    return {"ok": True}


# ---- Custom content types: books, magazines, videos ----
BOOK_FALLBACK: List[dict] = [
    {
        "id": "book-3d-retirement-income",
        "slug": "3d-retirement-income",
        "title": "3D Retirement Income",
        "subtitle": "Creating a retirement income that outpaces inflation, outlives you, and outperforms others.",
        "author": "Freeman Linde, CFP®, EA",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "chapters": 13,
        "pages": 222,
        "reading_time": 330,
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/40xd83yy_3D%20Retirement%20Income_FRONT.webp",
        "hero_image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/hmnk2et2_3D%20Retirement%20Income%20Background.webp",
        "excerpt": "Learn the three dimensions of a resilient retirement paycheck: income that outpaces inflation, outlives you, and outperforms the rest. Practical, plain-English strategies to keep you in control. Includes bonus appendices.",
        "content_html": "",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/8q5zu4tl_3D%20Retirement%20Income%201.5.pdf",
        "type": "book",
    },
    {
        "id": "book-tax-saving-strategies",
        "slug": "tax-saving-strategies",
        "title": "Tax Saving Strategies",
        "subtitle": "How couples over fifty can minimize long-term, lifetime, and legacy taxes.",
        "author": "Freeman Linde, CFP®, EA",
        "cover_gradient": ["#B0793A", "#C5A059"],
        "accent": "#4B3166",
        "chapters": 10,
        "reading_time": 150,
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/rumzktrz_Tax%20Saving%20Strategies%20Cover%20eBook.webp",
        "hero_image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/drdua4c2_Tax%20Saving%20Strategies%20Background.webp",
        "excerpt": "From Roth conversions to Social Security taxability, from RMDs to charitable stacking — the tax-smart playbook every retiree needs.",
        "content_html": "",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/5ong7p2b_Tax%20Savings%20Strategies.pdf",
        "type": "book",
    },
]


def _transform_cpt(p: dict, cpt: str) -> dict:
    """Transform a WordPress custom post type (book/magazine) response."""
    embedded = p.get("_embedded", {}) or {}
    featured = (embedded.get("wp:featuredmedia") or [{}])[0] or {}
    title = strip_html((p.get("title") or {}).get("rendered", ""))
    excerpt = strip_html((p.get("excerpt") or {}).get("rendered", ""))
    content_html = (p.get("content") or {}).get("rendered", "")
    return {
        "id": p.get("id"),
        "slug": p.get("slug"),
        "title": title,
        "excerpt": excerpt,
        "content_html": content_html,
        "date": p.get("date"),
        "modified": p.get("modified"),
        "link": p.get("link"),
        "image": featured.get("source_url"),
        "image_alt": featured.get("alt_text") or title,
        "type": cpt,
    }


async def _fetch_cpt(cpt: str) -> List[dict]:
    """Try to fetch a WP custom post type. Return [] if the CPT is not registered."""
    try:
        data = await wp_get(f"/{cpt}", {"per_page": 20, "_embed": 1}, ttl=180)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [_transform_cpt(p, cpt) for p in data]


@api_router.get("/books")
async def list_books():
    items = await _fetch_cpt("book")
    if not items:
        items = BOOK_FALLBACK
    return items


@api_router.get("/books/{book_id}")
async def get_book(book_id: str):
    if book_id.isdigit():
        try:
            data = await wp_get(f"/book/{book_id}", {"_embed": 1}, ttl=180)
            if isinstance(data, dict) and data.get("id"):
                return _transform_cpt(data, "book")
        except Exception:
            pass
    for b in BOOK_FALLBACK:
        if b["id"] == book_id or b["slug"] == book_id:
            return b
    # Fall back to magazines so the same reader route works for both
    for m in MAGAZINE_FALLBACK:
        if m["id"] == book_id or m["slug"] == book_id:
            # Present as book-shape so the reader UI works uniformly
            return {**m, "author": "RetireMentorship", "chapters": 0, "reading_time": 0, "hero_image": None}
    # Fall back to guides — flowcharts, checklists, references — so they
    # also open in the shared PDF reader.
    for g in GUIDE_FALLBACK:
        if g["id"] == book_id or g["slug"] == book_id:
            return {**g, "author": "RetireMentorship", "chapters": 0, "reading_time": 0, "hero_image": None}
    raise HTTPException(status_code=404, detail="Book not found")


MAGAZINE_FALLBACK: List[dict] = [
    {
        "id": "mag-evergreen-1",
        "slug": "evergreen-issue-1",
        "title": "Evergreen Issue",
        "subtitle": "Our most timeless articles, all in one essential issue.",
        "issue_label": "EVERGREEN",
        "cover_gradient": ["#2A5942", "#4A8567"],
        "accent": "#C5A059",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/1mm2e6xk_Evergreen%20Issue.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/vru7npn5_Evergreen%20Issue.pdf",
        "date": "2023-12-15",
        "type": "magazine",
    },
    {
        "id": "mag-evergreen-2",
        "slug": "evergreen-issue-2",
        "title": "Evergreen Issue Vol. 2",
        "subtitle": "Timeless guidance — lasting strategies & mindsets for your entire life.",
        "issue_label": "EVERGREEN",
        "cover_gradient": ["#1F4633", "#356646"],
        "accent": "#E4D0AB",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/z122jv5n_Evergreen%20Issue%202.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/bex1qyzf_Evergreen%20Issue%202.pdf",
        "date": "2025-06-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-1",
        "slug": "rmag-volume-1",
        "title": "Volume 1",
        "subtitle": "Spring 2023 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 1 · SPRING 2023",
        "cover_gradient": ["#4B3166", "#7A5B99"],
        "accent": "#C5A059",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/iyrt5guc_Vol1%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/l3byhtqz_RMag%20Vol1.pdf",
        "date": "2023-03-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-2",
        "slug": "rmag-volume-2",
        "title": "Volume 2",
        "subtitle": "Summer 2023 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 2 · SUMMER 2023",
        "cover_gradient": ["#B0793A", "#C5A059"],
        "accent": "#4B3166",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/kzxqhreg_Vol2%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/yeltnh1m_RMag%20Vol2.pdf",
        "date": "2023-06-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-3",
        "slug": "rmag-volume-3",
        "title": "Volume 3",
        "subtitle": "Fall 2023 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 3 · FALL 2023",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#E4D0AB",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/flfrmf2k_Vol3%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/b4xxls7v_RMag%20Vol3.pdf",
        "date": "2023-09-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-4",
        "slug": "rmag-volume-4",
        "title": "Volume 4",
        "subtitle": "Winter 2024 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 4 · WINTER 2024",
        "cover_gradient": ["#2A5942", "#4A8567"],
        "accent": "#E4D0AB",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/2ajiv2o9_Vol4%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/3lb4igbz_RMag%20Vol4.pdf",
        "date": "2024-01-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-5",
        "slug": "rmag-volume-5",
        "title": "Volume 5",
        "subtitle": "Spring 2024 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 5 · SPRING 2024",
        "cover_gradient": ["#6B2A2A", "#A83C3C"],
        "accent": "#E4D0AB",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/nuy105tq_Vol5%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/mvc9elyy_RMag%20Vol5.pdf",
        "date": "2024-03-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-6",
        "slug": "rmag-volume-6",
        "title": "Volume 6",
        "subtitle": "Summer 2024 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 6 · SUMMER 2024",
        "cover_gradient": ["#3A2452", "#6A4A8E"],
        "accent": "#C5A059",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/m7t68f6t_Vol6%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/v3d42gm0_RMag%20Vol6.pdf",
        "date": "2024-06-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-7",
        "slug": "rmag-volume-7",
        "title": "Volume 7",
        "subtitle": "Fall 2024 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 7 · FALL 2024",
        "cover_gradient": ["#8A5A2B", "#C5A059"],
        "accent": "#231F20",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/2oy90hxr_Vol7%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/ssf83eg3_RMag%20Vol7.pdf",
        "date": "2024-09-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-8",
        "slug": "rmag-volume-8",
        "title": "Volume 8",
        "subtitle": "Winter 2025 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 8 · WINTER 2025",
        "cover_gradient": ["#0E2A4B", "#1F3B6E"],
        "accent": "#C5A059",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/zxzmz6kf_Vol8%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/uxpldyx5_RMag%20Vol8.pdf",
        "date": "2025-01-15",
        "type": "magazine",
    },
    {
        "id": "mag-rmag-vol-9",
        "slug": "rmag-volume-9",
        "title": "Volume 9",
        "subtitle": "Spring 2025 · Retire successfully and stay successfully retired.",
        "issue_label": "VOLUME 9 · SPRING 2025",
        "cover_gradient": ["#1F4633", "#4A8567"],
        "accent": "#C5A059",
        "image": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/bgjdguwu_Vol9%20Cover.webp",
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/e043ib0b_RMag%20Vol9.pdf",
        "date": "2025-03-15",
        "type": "magazine",
    },
]


@api_router.get("/magazines")
async def list_magazines():
    items = await _fetch_cpt("magazine")
    if not items:
        items = MAGAZINE_FALLBACK
    return items


@api_router.get("/magazines/{mag_id}")
async def get_magazine(mag_id: str):
    if mag_id.isdigit():
        try:
            data = await wp_get(f"/magazine/{mag_id}", {"_embed": 1}, ttl=180)
            if isinstance(data, dict) and data.get("id"):
                return _transform_cpt(data, "magazine")
        except Exception:
            pass
    for m in MAGAZINE_FALLBACK:
        if m["id"] == mag_id or m["slug"] == mag_id:
            return m
    raise HTTPException(status_code=404, detail="Magazine not found")


# ---- Guides (flowcharts, tax guides, etc.) --------------------------------
# Each guide is a downloadable PDF that opens in the same reader used for
# books and magazines. Structure mirrors the magazine schema so the existing
# /book/read/[id] flow, bookmarks, and history all just work.
GUIDE_FALLBACK: List[dict] = [
    {
        "id": "guide-issues-before-i-retire-2026",
        "slug": "issues-before-i-retire-2026",
        "section": "Preparing for Retirement",
        "title": "What Issues Should I Consider Before I Retire?",
        "subtitle": "The must-review checklist before you pull the trigger.",
        "category": "Checklist · 2026",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/gddjpo6i_What-Issues-Should-I-Consider-Before-I-Retire-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-important-milestones",
        "slug": "important-milestones",
        "section": "Preparing for Retirement",
        "title": "Important Milestones",
        "subtitle": "Every age-based deadline that moves your plan.",
        "category": "Reference",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/x36e3fuj_Important-Milestones.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-important-numbers-2026",
        "slug": "important-numbers-2026",
        "section": "Preparing for Retirement",
        "title": "Important Numbers 2026",
        "subtitle": "The tax brackets, limits, and thresholds that matter.",
        "category": "Reference · 2026",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/62tymsu3_Important-Numbers-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-issues-end-of-year-2026",
        "slug": "issues-end-of-year-2026",
        "section": "Preparing for Retirement",
        "title": "What Issues Should I Consider Before The End Of The Year?",
        "subtitle": "Year-end planning moves you don't want to miss.",
        "category": "Year-End Checklist · 2026",
        "cover_gradient": ["#7A2E2E", "#B85454"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/c4lchcbc_What-Issues-Should-I-Consider-Before-The-End-Of-The-Year-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-issues-start-of-year",
        "slug": "issues-start-of-year",
        "section": "Preparing for Retirement",
        "title": "What Issues Should I Consider At The Start Of The Year?",
        "subtitle": "Kick off a fresh year with a clean planning slate.",
        "category": "Start-Of-Year Checklist",
        "cover_gradient": ["#5A3D0F", "#B08E48"],
        "accent": "#231F20",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/wgjxc2lp_What-Issues-Should-I-Consider-At-The-Start-Of-The-Year.pdf",
        "pages": 2,
        "type": "guide",
    },
    # ---- Retirement Income --------------------------------------------------
    {
        "id": "guide-withdraw-next-dollar",
        "slug": "withdraw-next-dollar",
        "section": "Retirement Income",
        "title": "Where Should I Withdraw My Next Dollar From?",
        "subtitle": "A withdrawal-order flowchart for retirement expenses.",
        "category": "Flowchart",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/fr2vmnt5_Where-Should-I-Withdraw-My-Next-Dollar-From-For-Retirement-Expenses.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-taxation-withdrawals-income",
        "slug": "taxation-withdrawals-income",
        "section": "Retirement Income",
        "title": "Taxation Guide To Withdrawals & Income Sources",
        "subtitle": "How each dollar of retirement income is taxed.",
        "category": "Reference",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/py5dfe4b_Taxation-Guide-To-Withdrawals-And-Income-Sources.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-issues-reviewing-rmd-2026",
        "slug": "issues-reviewing-rmd-2026",
        "section": "Retirement Income",
        "title": "What Issues Should I Consider When Reviewing My RMD?",
        "subtitle": "A checklist for every RMD-eligible year.",
        "category": "Checklist · 2026",
        "cover_gradient": ["#7A2E2E", "#B85454"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/mis4ub5b_What-Issues-Should-I-Consider-When-Reviewing-My-RMD-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-avoid-rmd-after-rbd",
        "slug": "avoid-rmd-after-rbd",
        "section": "Retirement Income",
        "title": "Can I Avoid Taking My RMD After Reaching My RBD?",
        "subtitle": "Decision flowchart for post-RBD strategies.",
        "category": "Flowchart",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/dxb06h1v_Can-I-Avoid-Taking-My-RMD-After-Reaching-My-Required-Beginning-Date-RBD.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-roth-distribution-tax-penalty-free",
        "slug": "roth-distribution-tax-penalty-free",
        "section": "Retirement Income",
        "title": "Will A Distribution From My Roth IRA Be Tax & Penalty Free?",
        "subtitle": "Rules and edge cases for Roth withdrawals.",
        "category": "Flowchart",
        "cover_gradient": ["#5A3D0F", "#B08E48"],
        "accent": "#231F20",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/0tb6dpfw_Will-A-Distribution-From-My-Roth-IRA-Be-Tax-038-Penalty-Free.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-traditional-ira-distribution-penalty-free",
        "slug": "traditional-ira-distribution-penalty-free",
        "section": "Retirement Income",
        "title": "Will A Distribution From My Traditional IRA Be Penalty Free?",
        "subtitle": "Age rules, exceptions, and the 10% penalty escape hatches.",
        "category": "Flowchart",
        "cover_gradient": ["#2A1B45", "#7A5AAE"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/c85ai2sp_Will-A-Distribution-From-My-Traditional-IRA-Be-Penalty-Free.pdf",
        "pages": 1,
        "type": "guide",
    },
    # ---- Roth & IRA Decisions -----------------------------------------------
    {
        "id": "guide-should-do-roth-conversion",
        "slug": "should-do-roth-conversion",
        "section": "Roth & IRA Decisions",
        "title": "Should I Consider Doing A Roth Conversion?",
        "subtitle": "Decision flowchart for evaluating a conversion.",
        "category": "Flowchart",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/0skgkw2x_Should-I-Consider-Doing-A-Roth-Conversion.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-roth-vs-traditional-ira-2026",
        "slug": "roth-vs-traditional-ira-2026",
        "section": "Roth & IRA Decisions",
        "title": "Should I Contribute To My Roth IRA vs. Traditional IRA?",
        "subtitle": "Choose the right bucket for this year's contribution.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/rfpdxcwl_Should-I-Contribute-To-My-Roth-IRA-Vs.-My-Traditional-IRA-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-can-contribute-roth-ira-2026",
        "slug": "can-contribute-roth-ira-2026",
        "section": "Roth & IRA Decisions",
        "title": "Can I Contribute To My Roth IRA?",
        "subtitle": "Income limits, phase-outs, and eligibility rules.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/gqj9qetd_Can-I-Contribute-To-My-Roth-IRA-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-backdoor-roth-ira-2026",
        "slug": "backdoor-roth-ira-2026",
        "section": "Roth & IRA Decisions",
        "title": "Can I Make A Backdoor Roth IRA Contribution?",
        "subtitle": "The step-by-step decision path if you're over the limit.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#7A2E2E", "#B85454"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/yuo5aho9_Can-I-Make-A-Backdoor-Roth-IRA-Contribution-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-roth-conversion-penalty-free",
        "slug": "roth-conversion-penalty-free",
        "section": "Roth & IRA Decisions",
        "title": "Will My Roth IRA Conversion Be Penalty Free?",
        "subtitle": "Nail the 5-year rules and avoid surprise penalties.",
        "category": "Flowchart",
        "cover_gradient": ["#5A3D0F", "#B08E48"],
        "accent": "#231F20",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/xyxmg0jf_Will-My-Roth-IRA-Conversion-Be-Penalty-Free.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-deduct-traditional-ira-2026",
        "slug": "deduct-traditional-ira-2026",
        "section": "Roth & IRA Decisions",
        "title": "Can I Deduct My Traditional IRA Contribution?",
        "subtitle": "Income limits and coverage rules for the deduction.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/m5qo4g13_Can-I-Deduct-My-Traditional-IRA-Contribution-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-mega-backdoor-roth-2026",
        "slug": "mega-backdoor-roth-2026",
        "section": "Roth & IRA Decisions",
        "title": "Can I Make A Mega Backdoor Roth Contribution?",
        "subtitle": "The after-tax 401(k) path to supercharged Roth savings.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/ydqzqoo5_Can-I-Make-A-Mega-Backdoor-Roth-Contribution-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-roth-401k-2026",
        "slug": "roth-401k-2026",
        "section": "Roth & IRA Decisions",
        "title": "Should I Contribute To My Roth 401(k)?",
        "subtitle": "Roth vs. pre-tax 401(k) decision at your bracket.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/o6jyn8e5_Should-I-Contribute-To-My-Roth-401k-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-rollover-dormant-401k",
        "slug": "rollover-dormant-401k",
        "section": "Roth & IRA Decisions",
        "title": "Should I Roll Over My Dormant Traditional 401(k)?",
        "subtitle": "IRA rollover vs. keep-in-plan decision flowchart.",
        "category": "Flowchart",
        "cover_gradient": ["#7A2E2E", "#B85454"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/fnj53ryr_Should-I-Roll-Over-My-Dormant-Traditional-401k.pdf",
        "pages": 1,
        "type": "guide",
    },
    # ---- Taxes in Retirement -----------------------------------------------
    {
        "id": "guide-obbba-comparison-2026",
        "slug": "obbba-comparison-2026",
        "section": "Taxes in Retirement",
        "title": "The One Big Beautiful Bill Act — Comparison Guide",
        "subtitle": "Side-by-side of what changed and what stayed the same.",
        "category": "Reference · 2026",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/5pgayznj_The-One-Big-Beautiful-Bill-Act-Comparison-Guide-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-obbba-issues-2026",
        "slug": "obbba-issues-2026",
        "section": "Taxes in Retirement",
        "title": "What Issues Should I Consider Regarding OBBBA Changes?",
        "subtitle": "Every planning move triggered by the new tax law.",
        "category": "Checklist · 2026",
        "cover_gradient": ["#7A2E2E", "#B85454"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/b4odvwbb_What-Important-Issues-Should-I-Consider-Regarding-Changes-Made-By-The-OBBBA-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-cap-gains-vs-roth-2026",
        "slug": "cap-gains-vs-roth-2026",
        "section": "Taxes in Retirement",
        "title": "Harvesting Capital Gains vs. Roth Conversions",
        "subtitle": "Which move has the smaller tax hit this year?",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/w47k7t08_What-Will-Have-The-Least-Tax-Impact-Harvesting-Capital-Gains-Or-Roth-Conversions-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-taxable-nonqualified-income",
        "slug": "taxable-nonqualified-income",
        "section": "Taxes in Retirement",
        "title": "Issues With Income From Taxable / Non-Qualified Accounts",
        "subtitle": "Dividends, interest, and capital gains planning traps.",
        "category": "Checklist",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/bu8ionjv_What-Issues-Should-I-Consider-With-The-Income-From-My-Taxable-Non-Qualified-Accounts.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-tax-on-investment-sale-2026",
        "slug": "tax-on-investment-sale-2026",
        "section": "Taxes in Retirement",
        "title": "Will I Have To Pay Tax On The Sale Of My Investment?",
        "subtitle": "Decision flowchart for cap gains, wash sales, and basis.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#5A3D0F", "#B08E48"],
        "accent": "#231F20",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/41ilybcn_Will-I-Have-To-Pay-Tax-On-The-Sale-Of-My-Investment-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-tax-guide-irmaa-2026",
        "slug": "tax-guide-irmaa-2026",
        "section": "Taxes in Retirement",
        "title": "RM Tax Guide + IRMAA",
        "subtitle": "Brackets, IRMAA tiers, and every threshold in one place.",
        "category": "Reference · 2026",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/mnp4cjls_2026%20RM%20Tax%20Guide%20IRMAA.pdf",
        "pages": 2,
        "type": "guide",
    },
    # ---- Charitable Giving --------------------------------------------------
    {
        "id": "guide-charitable-strategy-2026",
        "slug": "charitable-strategy-2026",
        "section": "Charitable Giving",
        "title": "Issues When Establishing My Charitable Giving Strategy",
        "subtitle": "Every big-picture question before you start giving.",
        "category": "Checklist · 2026",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/35fjid1j_What-Issues-Should-I-Consider-When-Establishing-My-Charitable-Giving-Strategy-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-charitable-giving-vehicles",
        "slug": "charitable-giving-vehicles",
        "section": "Charitable Giving",
        "title": "Common Charitable Giving Vehicles",
        "subtitle": "DAFs, CRTs, private foundations & more, at a glance.",
        "category": "Reference",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/55cgf2tw_Common-Charitable-Giving-Vehicles.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-deductible-charitable-gifts-2026",
        "slug": "deductible-charitable-gifts-2026",
        "section": "Charitable Giving",
        "title": "Common Deductible Charitable Gifts",
        "subtitle": "What qualifies, the limits, and how to substantiate them.",
        "category": "Reference · 2026",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/5pqx1qw5_Common-Deductible-Charitable-Gifts-2026.pdf",
        "pages": 2,
        "type": "guide",
    },
    {
        "id": "guide-qcd-from-ira-2026",
        "slug": "qcd-from-ira-2026",
        "section": "Charitable Giving",
        "title": "Can I Do A Qualified Charitable Distribution From My IRA?",
        "subtitle": "The rules, limits, and paperwork for a clean QCD.",
        "category": "Flowchart · 2026",
        "cover_gradient": ["#7A2E2E", "#B85454"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/ychlpkr1_Can-I-Do-A-Qualified-Charitable-Distribution-From-My-IRA-2026.pdf",
        "pages": 1,
        "type": "guide",
    },
    # ---- Estate & Inherited Accounts ---------------------------------------
    {
        "id": "guide-inherit-spouse-traditional-ira",
        "slug": "inherit-spouse-traditional-ira",
        "section": "Estate & Inherited Accounts",
        "title": "Should I Inherit My Deceased Spouse's Traditional IRA?",
        "subtitle": "Spousal rollover vs. inherited IRA decision flowchart.",
        "category": "Flowchart",
        "cover_gradient": ["#2A1B45", "#5A3D7A"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/qfx35d40_Should-I-Inherit-My-Deceased-Spouse8217s-Traditional-IRA.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-inherited-traditional-ira-distributions",
        "slug": "inherited-traditional-ira-distributions",
        "section": "Estate & Inherited Accounts",
        "title": "How Must I Take Distributions From The Traditional IRA I Inherited?",
        "subtitle": "Beneficiary rules and the 10-year window.",
        "category": "Flowchart",
        "cover_gradient": ["#1F3B6E", "#5A82BA"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/r6tkihdo_How-Must-I-Take-Distributions-From-The-Traditional-IRA-I-Inherited.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-inherited-roth-ira-distributions",
        "slug": "inherited-roth-ira-distributions",
        "section": "Estate & Inherited Accounts",
        "title": "How Must I Take Distributions From The Roth IRA I Inherited?",
        "subtitle": "Roth beneficiary rules explained step by step.",
        "category": "Flowchart",
        "cover_gradient": ["#0F4F3F", "#3F8E76"],
        "accent": "#C5A059",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/ddzvovzn_How-Must-I-Take-Distributions-From-The-Roth-IRA-I-Inherited.pdf",
        "pages": 1,
        "type": "guide",
    },
    {
        "id": "guide-twice-inherited-ira-distributions",
        "slug": "twice-inherited-ira-distributions",
        "section": "Estate & Inherited Accounts",
        "title": "How Must I Take Distributions From My Twice-Inherited Traditional IRA?",
        "subtitle": "Successor beneficiary rules after the second death.",
        "category": "Flowchart",
        "cover_gradient": ["#5A3D0F", "#B08E48"],
        "accent": "#231F20",
        "image": None,
        "pdf_url": "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/ndl70cr8_How-Must-I-Take-Distributions-From-My-Twice-Inherited-Traditional-IRA.pdf",
        "pages": 1,
        "type": "guide",
    },
]


@api_router.get("/guides")
async def list_guides():
    items = await _fetch_cpt("guide")
    if not items:
        items = GUIDE_FALLBACK
    return items


@api_router.get("/guides/{guide_id}")
async def get_guide(guide_id: str):
    if guide_id.isdigit():
        try:
            data = await wp_get(f"/guide/{guide_id}", {"_embed": 1}, ttl=180)
            if isinstance(data, dict) and data.get("id"):
                return _transform_cpt(data, "guide")
        except Exception:
            pass
    for g in GUIDE_FALLBACK:
        if g["id"] == guide_id or g["slug"] == guide_id:
            return g
    raise HTTPException(status_code=404, detail="Guide not found")


async def _course_lessons(tag_id: int) -> list[dict]:
    """Return all posts tagged with `tag_id`, oldest first (chronological course order)."""
    lessons: list[dict] = []
    page = 1
    while page <= 20:  # safety cap
        data = await wp_get("/posts", {
            "tags": tag_id, "per_page": 50, "_embed": 1,
            "orderby": "date", "order": "asc", "page": page,
        })
        if not isinstance(data, list) or not data:
            break
        lessons.extend(transform_post(p) for p in data)
        if len(data) < 50:
            break
        page += 1
    return lessons


# Long-lived "last good" cache of the courses list. Used to backfill courses
# that briefly disappear because WordPress rate-limited (429) their per-tag
# lesson fetch. This makes the Courses tab stable across transient hiccups.
_courses_last_good: dict = {"data": [], "ts": 0.0}


@api_router.get("/courses")
async def list_courses():
    """Every WP tag with 2+ posts becomes a Course. Sorted by the newest
    published lesson (most-recent-post-first)."""
    tags = await wp_get("/tags", {"per_page": 100, "orderby": "count", "order": "desc", "hide_empty": True})
    if not isinstance(tags, list):
        return _courses_last_good.get("data") or []
    out: list[dict] = []
    for idx, t in enumerate(tags):
        count = int(t.get("count") or 0)
        if count < 2:
            continue
        # Small breather between tag fetches — avoids tripping WP's burst
        # rate-limit which was silently dropping the last course or two.
        if idx > 0:
            await asyncio.sleep(0.35)
        # Fetch lesson stubs. Longer TTL to avoid burning our WP rate-limit
        # budget re-fetching every 3 min.
        stubs = await wp_get(
            "/posts",
            {"tags": t["id"], "per_page": 100, "_embed": 1, "orderby": "date", "order": "asc"},
            ttl=900,
        )
        lesson_ids: list[str] = []
        first = None
        newest_date: str = ""
        if isinstance(stubs, list) and stubs:
            first = transform_post(stubs[0])
            for p in stubs:
                try:
                    lesson_ids.append(str(p.get("id")))
                except Exception:
                    pass
                # Newest *published* post drives the course ordering.
                pub = str(p.get("date") or "")
                if pub and pub > newest_date:
                    newest_date = pub
        if len(lesson_ids) < 2:
            continue
        out.append({
            "id": f"course-{t['id']}",
            "tag_id": t["id"],
            "slug": t["slug"],
            "title": _html.unescape(t.get("name") or ""),
            "description": _html.unescape((t.get("description") or "")).strip(),
            "lesson_count": len(lesson_ids),
            "lesson_ids": lesson_ids,
            "image": (first or {}).get("image"),
            "started_at": (first or {}).get("date"),
            "last_activity_at": newest_date or None,
        })

    # Stale-fallback merge: if a previously-known course didn't appear this
    # round (typically because WP rate-limited its /posts call), keep the last
    # good record so the tab doesn't visibly lose courses.
    prev: list[dict] = _courses_last_good.get("data") or []
    if prev:
        seen = {c.get("tag_id") for c in out}
        for c in prev:
            if c.get("tag_id") not in seen:
                out.append(c)

    # Newest published lesson lands the course at the top.
    out.sort(key=lambda c: c.get("last_activity_at") or "", reverse=True)

    _courses_last_good["data"] = out
    _courses_last_good["ts"] = time.time()
    return out


@api_router.get("/courses/{tag_id}")
async def get_course(tag_id: int):
    tag = await wp_get(f"/tags/{tag_id}")
    if not isinstance(tag, dict) or not tag.get("id"):
        raise HTTPException(status_code=404, detail="Course not found")
    lessons = await _course_lessons(tag_id)
    return {
        "id": f"course-{tag['id']}",
        "tag_id": tag["id"],
        "slug": tag.get("slug"),
        "title": _html.unescape(tag.get("name") or ""),
        "description": _html.unescape((tag.get("description") or "")).strip(),
        "lesson_count": len(lessons),
        "image": (lessons[0].get("image") if lessons else None),
        "lessons": lessons,
    }



@api_router.get("/videos")
async def list_videos(limit: int = 20, page: int = 1):
    """
    Videos list, paginated. Returns `{ items, page, has_more }`.

    Two data paths:
      1. If the WP site has a dedicated `video` CPT, we use it (page-slicing in memory).
      2. Otherwise we synthesize videos from posts whose content embeds YouTube/Vimeo.
    """
    page = max(1, int(page))
    per_page = max(1, min(int(limit), 50))

    # 1) Dedicated CPT (mocked/synthesized in-memory list)
    all_from_cpt = await _fetch_cpt("video")
    if all_from_cpt:
        start = (page - 1) * per_page
        end = start + per_page
        return {
            "items": all_from_cpt[start:end],
            "page": page,
            "has_more": end < len(all_from_cpt),
        }

    # 2) Filter posts. Because not every post is a video, we walk WP pages
    #    from the start each request and accumulate video posts until we have
    #    enough to serve the requested slice.
    wp_per_page = 50
    wp_page = 1
    collected: list[dict] = []
    wp_has_more = True
    end = page * per_page
    while len(collected) < end and wp_has_more:
        data = await wp_get("/posts", {
            "per_page": wp_per_page,
            "_embed": 1,
            "orderby": "date",
            "order": "desc",
            "page": wp_page,
        })
        if not isinstance(data, list) or not data:
            wp_has_more = False
            break
        collected.extend(p for p in (transform_post(x) for x in data) if p["type"] == "video")
        wp_has_more = len(data) >= wp_per_page
        wp_page += 1
        if wp_page > 30:  # safety cap: don't fetch more than 1,500 posts
            break

    start = (page - 1) * per_page
    return {
        "items": collected[start:end],
        "page": page,
        "has_more": end < len(collected) or wp_has_more,
    }


class BookProgressIn(BaseModel):
    book_id: str
    page: int
    total_pages: int = 0
    updated_at: Optional[float] = None  # client ms


@api_router.get("/user/book-progress")
async def user_book_progress_list(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    docs = await db.book_progress.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(200)
    return docs


@api_router.get("/user/book-progress/{book_id}")
async def user_book_progress_get(book_id: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    doc = await db.book_progress.find_one({"user_id": user["user_id"], "book_id": book_id}, {"_id": 0})
    return doc or {"book_id": book_id, "page": 0, "total_pages": 0}


@api_router.post("/user/book-progress")
async def user_book_progress_set(payload: BookProgressIn, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    existing = await db.book_progress.find_one(
        {"user_id": user["user_id"], "book_id": payload.book_id}, {"_id": 0}
    )
    # Last-write-wins by updated_at ms
    incoming_ts = payload.updated_at or (utcnow().timestamp() * 1000)
    existing_ts = existing.get("updated_at_ms") if existing else 0
    if existing and existing_ts and incoming_ts < existing_ts:
        return existing
    doc = {
        "user_id": user["user_id"],
        "book_id": payload.book_id,
        "page": max(1, payload.page),
        "total_pages": max(payload.total_pages, (existing or {}).get("total_pages", 0)),
        "updated_at": utcnow(),
        "updated_at_ms": incoming_ts,
    }
    await db.book_progress.update_one(
        {"user_id": user["user_id"], "book_id": payload.book_id},
        {"$set": doc},
        upsert=True,
    )
    doc.pop("updated_at", None)  # drop datetime for JSON return
    doc["updated_at_ms"] = incoming_ts
    return doc


@api_router.get("/")
async def root():
    return {"service": "RetireMentorship API", "ok": True}


# ---- Admin: lead export ----
def _check_admin(x_admin_key: Optional[str]) -> None:
    if not ADMIN_API_KEY or not x_admin_key or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Admin auth required")


@api_router.get("/admin/leads")
async def admin_leads(
    x_admin_key: Optional[str] = Header(None),
    limit: int = 200,
    stage: Optional[str] = None,
    q: Optional[str] = None,
):
    _check_admin(x_admin_key)
    query: Dict[str, Any] = {}
    if stage:
        query["retirement_stage"] = stage
    if q:
        query["$or"] = [{"email": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}}]
    cur = db.users.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 1000))
    docs = await cur.to_list(1000)
    total = await db.users.count_documents({})
    return {"total": total, "count": len(docs), "leads": docs}


@api_router.get("/admin/leads.csv")
async def admin_leads_csv(x_admin_key: Optional[str] = Header(None)):
    _check_admin(x_admin_key)
    cur = db.users.find({}, {"_id": 0}).sort("created_at", -1)
    docs = await cur.to_list(5000)
    from io import StringIO
    import csv
    buf = StringIO()
    w = csv.writer(buf)
    w.writerow(["email", "first_name", "last_name", "phone", "retirement_stage", "verified", "created_at", "last_login", "user_id", "source"])
    for d in docs:
        w.writerow([
            d.get("email", ""),
            d.get("first_name", ""),
            d.get("last_name", ""),
            d.get("phone", ""),
            d.get("retirement_stage") or "",
            "yes" if d.get("verified") else "no",
            d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else (d.get("created_at") or ""),
            d.get("last_login").isoformat() if isinstance(d.get("last_login"), datetime) else (d.get("last_login") or ""),
            d.get("user_id", ""),
            d.get("source") or "email",
        ])
    from fastapi.responses import Response
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=retirementorship-leads.csv"})


# ---- Freshness / sync helper ----
@api_router.get("/wp/latest-modified")
async def wp_latest_modified():
    """Return the most recent post `modified` timestamp — cheap freshness check for clients."""
    data = await wp_get("/posts", {"per_page": 1, "orderby": "modified", "order": "desc"}, ttl=60)
    if not isinstance(data, list) or not data:
        return {"modified": None}
    return {"modified": (data[0] or {}).get("modified"), "id": (data[0] or {}).get("id")}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        # New session shape uses token_hash. Best-effort: drop the legacy session_token index if it exists.
        try:
            await db.user_sessions.drop_index("session_token_1")
        except Exception:
            pass
        await db.user_sessions.create_index("token_hash", unique=True, sparse=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.user_verification_codes.create_index("expires_at", expireAfterSeconds=0)
        await db.user_verification_codes.create_index([("user_id", 1), ("created_at", -1)])
        await db.login_attempts.create_index("key", unique=True)
        await db.bookmarks.create_index([("user_id", 1), ("post_id", 1)], unique=True)
        await db.history.create_index([("user_id", 1), ("post_id", 1)], unique=True)
        await db.book_progress.create_index([("user_id", 1), ("book_id", 1)], unique=True)

        # One-time migration: convert any existing int post_ids to strings
        try:
            for coll_name in ("bookmarks", "history"):
                coll = db[coll_name]
                cursor = coll.find({"post_id": {"$type": "int"}}, {"_id": 1, "post_id": 1})
                async for doc in cursor:
                    await coll.update_one({"_id": doc["_id"]}, {"$set": {"post_id": str(doc["post_id"])}})
        except Exception as mig_e:
            logger.warning(f"post_id migration skipped: {mig_e}")

        # Email verification removed — mark every existing account verified.
        try:
            await db.users.update_many({"verified": {"$ne": True}}, {"$set": {"verified": True}})
        except Exception as e:
            logger.warning(f"verified-migration skipped: {e}")

        # Auth migration: wipe legacy Google-sourced accounts and their sessions
        # (user requested option 3a on the auth switch — dev only, no real users yet).
        try:
            legacy = await db.users.find(
                {"$or": [{"source": "google"}, {"password_hash": {"$exists": False}}]},
                {"user_id": 1, "_id": 0},
            ).to_list(10000)
            legacy_ids = [u["user_id"] for u in legacy if u.get("user_id")]
            if legacy_ids:
                await db.users.delete_many({"user_id": {"$in": legacy_ids}})
                await db.user_sessions.delete_many({"user_id": {"$in": legacy_ids}})
                await db.bookmarks.delete_many({"user_id": {"$in": legacy_ids}})
                await db.history.delete_many({"user_id": {"$in": legacy_ids}})
                await db.book_progress.delete_many({"user_id": {"$in": legacy_ids}})
                await db.user_verification_codes.delete_many({"user_id": {"$in": legacy_ids}})
                logger.info(f"Wiped {len(legacy_ids)} legacy Google user(s) on auth switch")
        except Exception as auth_mig_e:
            logger.warning(f"legacy auth wipe skipped: {auth_mig_e}")

        logger.info("Indexes ensured")
    except Exception as e:
        logger.warning(f"Index setup: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
