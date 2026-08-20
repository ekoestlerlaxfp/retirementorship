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
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

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


def transform_post(p: dict) -> dict:
    embedded = p.get("_embedded", {}) or {}
    featured = (embedded.get("wp:featuredmedia") or [{}])[0] or {}
    terms = embedded.get("wp:term") or []
    category = None
    for group in terms:
        for t in group:
            if t.get("taxonomy") == "category":
                category = {"id": t.get("id"), "name": t.get("name"), "slug": t.get("slug")}
                break
        if category:
            break
    author = (embedded.get("author") or [{}])[0] or {}
    title = strip_html((p.get("title") or {}).get("rendered", ""))
    excerpt = strip_html((p.get("excerpt") or {}).get("rendered", ""))
    content_html = (p.get("content") or {}).get("rendered", "")
    words = len(strip_html(content_html).split()) if content_html else 0
    reading_time = max(1, round(words / 220))
    # Detect if the content is primarily a video (has iframe/youtube) → mark type video
    is_video = bool(content_html) and (
        "youtube.com/embed" in content_html
        or "youtu.be/" in content_html
        or "player.vimeo" in content_html
        or "wp-block-embed-youtube" in content_html
    )
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
    }


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- Models ----
class SessionExchangeIn(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    retirement_stage: Optional[str] = None


class OnboardingIn(BaseModel):
    retirement_stage: str  # "10+" | "5-10" | "0-5" | "retired"


class BookmarkIn(BaseModel):
    post_id: int
    title: str
    image: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = "article"


class HistoryIn(BaseModel):
    post_id: int
    title: str
    image: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = "article"
    progress: Optional[float] = 0.0  # 0..1


# ---- Auth helpers ----
async def get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < utcnow():
            return None
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    return user


async def require_user(authorization: Optional[str]) -> dict:
    user = await get_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ---- Auth routes ----
@api_router.post("/auth/session")
async def auth_session(payload: SessionExchangeIn):
    async with httpx.AsyncClient(timeout=15.0) as hc:
        try:
            r = await hc.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": payload.session_id})
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Auth service error: {e}")
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        data = r.json()

    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Missing user data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    is_new_user = False
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": utcnow()}},
        )
    else:
        is_new_user = True
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "retirement_stage": None,
            "source": "google",
            "created_at": utcnow(),
            "last_login": utcnow(),
        })

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": utcnow(),
        "expires_at": utcnow() + timedelta(days=7),
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})

    # Fire the leads webhook (fire-and-forget) for new signups
    if is_new_user and LEADS_WEBHOOK_URL:
        asyncio.create_task(_fire_leads_webhook(user))

    return {"session_token": session_token, "user": user}


async def _fire_leads_webhook(user: dict):
    try:
        payload = {
            "email": user.get("email"),
            "name": user.get("name"),
            "picture": user.get("picture"),
            "user_id": user.get("user_id"),
            "retirement_stage": user.get("retirement_stage"),
            "created_at": user.get("created_at").isoformat() if isinstance(user.get("created_at"), datetime) else user.get("created_at"),
            "source": user.get("source", "google"),
        }
        async with httpx.AsyncClient(timeout=10.0) as hc:
            await hc.post(LEADS_WEBHOOK_URL, json=payload)
    except Exception as e:
        logger.warning(f"Leads webhook failed: {e}")


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    return {"user": user}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
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
    return [{"id": c["id"], "name": c["name"], "slug": c["slug"], "count": c.get("count", 0)} for c in filtered]


@api_router.get("/wp/posts")
async def wp_posts(
    page: int = 1,
    per_page: int = 10,
    category: Optional[int] = None,
    search: Optional[str] = None,
):
    params: Dict[str, Any] = {"page": page, "per_page": min(per_page, 20), "_embed": 1}
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
async def user_bookmark_remove(post_id: int, authorization: Optional[str] = Header(None)):
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
    doc = {
        "user_id": user["user_id"],
        "post_id": payload.post_id,
        "title": payload.title,
        "image": payload.image,
        "category": payload.category,
        "type": payload.type,
        "progress": payload.progress,
        "updated_at": utcnow(),
    }
    await db.history.update_one(
        {"user_id": user["user_id"], "post_id": payload.post_id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


# ---- Custom content types: books, magazines, videos ----
BOOK_FALLBACK: List[dict] = [
    {
        "id": "book-3d-retirement-income",
        "slug": "3d-retirement-income",
        "title": "3D Retirement Income",
        "subtitle": "A framework for durable, diversified, and dependable retirement income.",
        "author": "RetireMentorship",
        "cover_gradient": ["#4B3166", "#7A5B99"],
        "accent": "#C5A059",
        "chapters": 12,
        "reading_time": 180,
        "image": None,
        "excerpt": "Learn the three dimensions of a resilient retirement paycheck: guaranteed income, growth income, and flexible income. Practical, plain-English strategies to keep you in control.",
        "content_html": "",
        "pdf_url": "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
        "type": "book",
    },
    {
        "id": "book-tax-saving-strategies",
        "slug": "tax-saving-strategies",
        "title": "Tax Saving Strategies",
        "subtitle": "Legally keep more of what you've earned in retirement.",
        "author": "RetireMentorship",
        "cover_gradient": ["#B0793A", "#C5A059"],
        "accent": "#4B3166",
        "chapters": 10,
        "reading_time": 150,
        "image": None,
        "excerpt": "From Roth conversions to Social Security taxability, from RMDs to charitable stacking — the tax-smart playbook every retiree needs.",
        "content_html": "",
        "pdf_url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
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
    # Try WordPress first (numeric id → CPT)
    if book_id.isdigit():
        try:
            data = await wp_get(f"/book/{book_id}", {"_embed": 1}, ttl=180)
            if isinstance(data, dict) and data.get("id"):
                return _transform_cpt(data, "book")
        except Exception:
            pass
    # Fall back to seed
    for b in BOOK_FALLBACK:
        if b["id"] == book_id or b["slug"] == book_id:
            return b
    raise HTTPException(status_code=404, detail="Book not found")


@api_router.get("/magazines")
async def list_magazines():
    items = await _fetch_cpt("magazine")
    return items  # empty until you register the CPT — the UI shows a nice "coming soon" state


@api_router.get("/videos")
async def list_videos(limit: int = 20):
    # Try a dedicated CPT first
    items = await _fetch_cpt("video")
    if items:
        return items[:limit]
    # Otherwise synthesize from posts whose content embeds YouTube/Vimeo
    data = await wp_get("/posts", {"per_page": min(limit, 20), "_embed": 1, "orderby": "date", "order": "desc"})
    if not isinstance(data, list):
        data = []
    all_posts = [transform_post(p) for p in data]
    return [p for p in all_posts if p["type"] == "video"][:limit]


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
    w.writerow(["email", "name", "retirement_stage", "created_at", "last_login", "user_id", "picture", "source"])
    for d in docs:
        w.writerow([
            d.get("email", ""),
            d.get("name", ""),
            d.get("retirement_stage") or "",
            d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else (d.get("created_at") or ""),
            d.get("last_login").isoformat() if isinstance(d.get("last_login"), datetime) else (d.get("last_login") or ""),
            d.get("user_id", ""),
            d.get("picture") or "",
            d.get("source") or "google",
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
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.bookmarks.create_index([("user_id", 1), ("post_id", 1)], unique=True)
        await db.history.create_index([("user_id", 1), ("post_id", 1)], unique=True)
        await db.book_progress.create_index([("user_id", 1), ("book_id", 1)], unique=True)
        logger.info("Indexes ensured")
    except Exception as e:
        logger.warning(f"Index setup: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
