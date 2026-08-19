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
CACHE_TTL = 900  # 15 min


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
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": utcnow()}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "retirement_stage": None,
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
    return {"session_token": session_token, "user": user}


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
async def wp_home_feed(stage: Optional[str] = None):
    async def latest():
        return await wp_get("/posts", {"per_page": 10, "_embed": 1, "orderby": "date", "order": "desc"})

    latest_data = await latest()
    if isinstance(latest_data, Exception) or not isinstance(latest_data, list):
        latest_data = []

    latest_posts = [transform_post(p) for p in latest_data]
    featured_posts = latest_posts[:5]
    video_posts = [p for p in latest_posts if p["type"] == "video"][:8]
    # Trending = a shuffled-ish subset of latest (WP comment_count not always available)
    trending_posts = (latest_posts[5:13] if len(latest_posts) > 5 else latest_posts)[:8]
    tip = latest_posts[0] if latest_posts else None

    return {
        "hero": featured_posts[0] if featured_posts else None,
        "featured": featured_posts,
        "latest": latest_posts,
        "videos": video_posts,
        "trending": trending_posts,
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


@api_router.get("/")
async def root():
    return {"service": "RetireMentorship API", "ok": True}


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
        logger.info("Indexes ensured")
    except Exception as e:
        logger.warning(f"Index setup: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
