"""
RetireMentorship Iteration 7 tests.

Covers:
- GET /api/books returns 2 books with author == 'Freeman Linde, CFP®' (with ® symbol)
- GET /api/books/book-3d-retirement-income author correct
- GET /api/books/book-tax-saving-strategies author correct
- GET /api/videos?limit=5 each has type=='video' and content_html contains a YouTube URL
- Regressions: /api/wp/home-feed disjoint rails, /api/wp/latest-modified, /api/admin/leads gating
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "rm_admin_ChangeMe_2026")

EXPECTED_AUTHOR = "Freeman Linde, CFP\u00ae"  # 'Freeman Linde, CFP®'


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fetch_home_feed(api_client, params=None):
    r = None
    for _ in range(2):
        r = api_client.get(f"{API}/wp/home-feed", params=params or {}, timeout=45)
        if r.status_code == 200:
            body = r.json() or {}
            if body.get("hero") or body.get("latest"):
                return body
        time.sleep(5)
    assert r is not None and r.status_code == 200, (r.text if r is not None else "no response")
    return r.json()


# ---- Books author (iter 7) ----
class TestBooksAuthor:
    def test_books_list_all_have_freeman_linde_author(self, api_client):
        r = api_client.get(f"{API}/books", timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 2, f"expected 2 books, got {len(items)}"
        for b in items:
            assert b.get("type") == "book"
            assert isinstance(b.get("pdf_url"), str) and b["pdf_url"].strip(), (
                f"pdf_url missing/empty: {b}"
            )
            author = b.get("author")
            # author may be dict {name: ...} or string; accept either
            author_name = author.get("name") if isinstance(author, dict) else author
            assert author_name == EXPECTED_AUTHOR, (
                f"unexpected author for {b.get('id')!r}: got={author_name!r} expected={EXPECTED_AUTHOR!r}"
            )

    def test_book_3d_retirement_income_author(self, api_client):
        r = api_client.get(f"{API}/books/book-3d-retirement-income", timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        author = b.get("author")
        author_name = author.get("name") if isinstance(author, dict) else author
        assert author_name == EXPECTED_AUTHOR, (
            f"got={author_name!r} expected={EXPECTED_AUTHOR!r}"
        )

    def test_book_tax_saving_strategies_author(self, api_client):
        r = api_client.get(f"{API}/books/book-tax-saving-strategies", timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        author = b.get("author")
        author_name = author.get("name") if isinstance(author, dict) else author
        assert author_name == EXPECTED_AUTHOR, (
            f"got={author_name!r} expected={EXPECTED_AUTHOR!r}"
        )


# ---- Videos content_html YouTube embeds (iter 7) ----
class TestVideosContentHtml:
    YOUTUBE_MARKERS = ("youtube.com/embed/", "youtu.be/", "youtube.com/watch?v=")

    def test_videos_have_youtube_content_html(self, api_client):
        items = None
        for _ in range(3):
            r = api_client.get(f"{API}/videos", params={"limit": 5}, timeout=45)
            assert r.status_code == 200, r.text
            items = r.json()
            if isinstance(items, list) and len(items) >= 1:
                break
            time.sleep(5)
        assert isinstance(items, list) and len(items) >= 1, (
            f"expected >=1 videos, got {items}"
        )
        assert len(items) <= 5
        for v in items:
            assert v.get("type") == "video", f"item type not video: {v.get('type')}"
            html = v.get("content_html") or ""
            assert isinstance(html, str) and html.strip(), (
                f"content_html missing/empty for video id={v.get('id')}"
            )
            assert any(m in html for m in self.YOUTUBE_MARKERS), (
                f"video id={v.get('id')} content_html has no youtube marker. "
                f"first 200 chars: {html[:200]!r}"
            )


# ---- Regressions ----
class TestRegressions:
    def test_home_feed_disjoint_rails(self, api_client):
        body = _fetch_home_feed(api_client)
        for key in ("hero", "tip", "videos", "trending", "recommended"):
            assert key in body, f"missing key {key}"
        hero = body["hero"]; tip = body["tip"]
        assert hero and hero.get("id"), "hero missing"
        assert tip and tip.get("id"), "tip missing"
        vid_ids = [v["id"] for v in body["videos"]]
        tr_ids = [t["id"] for t in body["trending"]]
        rec_ids = [r["id"] for r in body["recommended"]]
        all_ids = [hero["id"], tip["id"]] + vid_ids + tr_ids + rec_ids
        assert len(all_ids) == len(set(all_ids)), (
            f"cross-rail dup ids. hero={hero['id']} tip={tip['id']} videos={vid_ids} "
            f"trending={tr_ids} recommended={rec_ids}"
        )

    def test_latest_modified(self, api_client):
        body = None
        for _ in range(2):
            r = api_client.get(f"{API}/wp/latest-modified", timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            if body.get("modified"):
                break
            time.sleep(5)
        assert body and body.get("modified") and "T" in body["modified"]
        assert isinstance(body.get("id"), int) and body["id"] > 0

    def test_admin_leads_no_key_401(self):
        r = requests.get(f"{API}/admin/leads", timeout=15)
        assert r.status_code == 401

    def test_admin_leads_correct_key_200(self):
        r = requests.get(
            f"{API}/admin/leads", headers={"X-Admin-Key": ADMIN_KEY}, timeout=15
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "leads" in body and isinstance(body["leads"], list)
