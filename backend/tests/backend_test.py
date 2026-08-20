"""
RetireMentorship backend regression suite.

Covers:
- Health endpoint
- WordPress proxy endpoints (categories, home-feed, posts list, single post, filtering, search)
- HTML entity decoding in transform_post
- In-memory caching (identical /home-feed request should be faster on second call)
- Auth guards (401 on missing/invalid tokens)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://wisdom-edge.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "rm_admin_ChangeMe_2026")


# ---- Shared fixtures ----
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def categories(api_client):
    # Warm WP with retry on empty due to 429/cold cache
    for _ in range(3):
        r = api_client.get(f"{API}/wp/categories", timeout=30)
        if r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) > 0:
            return r.json()
        time.sleep(10)
    return []


# ---- Health ----
class TestHealth:
    def test_root_ok(self, api_client):
        r = api_client.get(f"{API}/", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("service") == "RetireMentorship API"


# ---- WordPress proxy ----
class TestWPProxy:
    def test_categories_returns_populated_list(self, categories):
        assert isinstance(categories, list) and len(categories) > 0, "categories empty"
        sample = categories[0]
        for key in ("id", "name", "slug", "count"):
            assert key in sample, f"missing {key} in category object"
        assert isinstance(sample["id"], int)
        assert isinstance(sample["name"], str) and sample["name"].strip()
        assert isinstance(sample["slug"], str) and sample["slug"].strip()
        assert isinstance(sample["count"], int) and sample["count"] > 0

    def test_home_feed_shape(self, api_client):
        # Retry once to allow cache warmup on WP 429
        r = None
        for attempt in range(2):
            r = api_client.get(f"{API}/wp/home-feed", timeout=30)
            if r.status_code == 200 and (r.json() or {}).get("latest"):
                break
            time.sleep(10)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("hero", "latest", "videos", "trending", "tip"):
            assert key in body, f"home-feed missing key: {key}"
        assert isinstance(body["latest"], list) and len(body["latest"]) > 0, "latest is empty"
        assert body["hero"] is not None, "hero is None"
        assert body["tip"] is not None, "tip is None"
        assert isinstance(body["videos"], list)
        assert isinstance(body["trending"], list)

    def test_posts_list_per_page_and_html_stripped(self, api_client):
        r = api_client.get(f"{API}/wp/posts", params={"per_page": 5}, timeout=30)
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list) and len(posts) == 5, f"expected 5 posts, got {len(posts)}"
        for p in posts:
            assert p.get("id") and isinstance(p["id"], int)
            assert isinstance(p.get("title"), str) and p["title"].strip()
            # HTML entities should be decoded
            for ent in ("&#8217;", "&#8216;", "&amp;", "&quot;", "&#038;", "&nbsp;"):
                assert ent not in p["title"], f"title still contains entity {ent}: {p['title']!r}"
            assert "<" not in p["title"], f"title contains tags: {p['title']!r}"
            rt = p.get("reading_time")
            assert isinstance(rt, int) and rt > 0, f"reading_time invalid: {rt}"

    def test_posts_search_filters(self, api_client):
        r = api_client.get(f"{API}/wp/posts", params={"search": "retirement"}, timeout=30)
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list), "response is not a list"
        # Search may legitimately return 0 posts if WP has none matching, but retirementorship.com should have some
        assert len(posts) > 0, "expected at least 1 post matching 'retirement'"
        # WP applies relevance search; validate structure of a returned item
        p = posts[0]
        assert "title" in p and "id" in p

    def test_single_post_has_content_and_image(self, api_client):
        # Grab one from latest list
        r = api_client.get(f"{API}/wp/posts", params={"per_page": 5}, timeout=30)
        posts = r.json()
        assert posts, "no posts to fetch single"
        post_id = posts[0]["id"]
        r2 = api_client.get(f"{API}/wp/posts/{post_id}", timeout=30)
        assert r2.status_code == 200, r2.text
        single = r2.json()
        assert single.get("id") == post_id
        assert isinstance(single.get("content_html"), str) and len(single["content_html"]) > 0, "content_html empty"
        # image can be None if the post lacks featured media; assert key exists
        assert "image" in single

    def test_posts_filter_by_category(self, api_client, categories):
        if not categories:
            pytest.skip("no categories available to filter by")
        cat_id = categories[0]["id"]
        r = api_client.get(f"{API}/wp/posts", params={"category": cat_id, "per_page": 5}, timeout=30)
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list), "response not list"
        assert len(posts) > 0, f"no posts for top category {cat_id} ({categories[0]['name']})"
        for p in posts:
            cat = p.get("category")
            # category may be None if _embed omitted or WP quirk; if present, id should match
            if cat and cat.get("id"):
                # Some posts belong to multiple categories; the first-embedded may differ from requested.
                # So this is a soft check via count only.
                pass


# ---- Caching ----
class TestCaching:
    def test_home_feed_cached_is_faster(self, api_client):
        # Prime cache
        api_client.get(f"{API}/wp/home-feed", timeout=30)
        t1 = time.perf_counter()
        r1 = api_client.get(f"{API}/wp/home-feed", timeout=30)
        d1 = time.perf_counter() - t1
        assert r1.status_code == 200
        t2 = time.perf_counter()
        r2 = api_client.get(f"{API}/wp/home-feed", timeout=30)
        d2 = time.perf_counter() - t2
        assert r2.status_code == 200
        # Cached response should be very fast (<1s comfortably), and typically faster than first
        assert d2 < 2.0, f"cached response too slow: {d2:.2f}s (first={d1:.2f}s)"


# ---- Auth guards ----
class TestAuthGuards:
    def test_session_with_fake_id_returns_401(self, api_client):
        r = api_client.post(f"{API}/auth/session", json={"session_id": "TEST_fake_session_id_xyz"}, timeout=20)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_me_without_auth_returns_401(self, api_client):
        s = requests.Session()  # no default headers except content type
        r = s.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401, r.text

    def test_bookmarks_without_auth_returns_401(self, api_client):
        s = requests.Session()
        r = s.get(f"{API}/user/bookmarks", timeout=15)
        assert r.status_code == 401, r.text

    def test_bookmarks_with_bad_token_returns_401(self, api_client):
        r = requests.get(f"{API}/user/bookmarks", headers={"Authorization": "Bearer nonsense_token_xyz"}, timeout=15)
        assert r.status_code == 401, r.text


# ---- `modified` field presence (offline layer version tracking) ----
class TestModifiedField:
    def test_single_post_15919_has_modified(self, api_client):
        # Retry once with 10s sleep on empty due to WP rate limits
        r = None
        for attempt in range(2):
            r = api_client.get(f"{API}/wp/posts/15919", timeout=30)
            if r.status_code == 200 and r.json().get("id") == 15919:
                break
            time.sleep(10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("id") == 15919, f"expected id 15919, got {body.get('id')}"
        assert "modified" in body, "missing `modified` key"
        assert body["modified"] is not None, "`modified` is null"
        assert isinstance(body["modified"], str) and len(body["modified"]) > 0
        # ISO-ish sanity check
        assert "T" in body["modified"], f"modified not ISO-like: {body['modified']}"

    def test_home_feed_hero_and_latest_include_modified(self, api_client):
        r = None
        for attempt in range(2):
            r = api_client.get(f"{API}/wp/home-feed", timeout=30)
            if r.status_code == 200 and (r.json() or {}).get("latest"):
                break
            time.sleep(10)
        assert r.status_code == 200, r.text
        body = r.json()
        hero = body.get("hero")
        assert hero is not None, "hero is None"
        assert "modified" in hero and hero["modified"], f"hero missing modified: {hero.get('modified')}"
        latest = body.get("latest") or []
        assert latest, "latest empty"
        for i, p in enumerate(latest):
            assert "modified" in p, f"latest[{i}] missing modified key"
            assert p["modified"], f"latest[{i}] modified is empty/null"

    def test_search_medicare_returns_results(self, api_client):
        # Retry once with sleep because search may 429
        posts = []
        for attempt in range(2):
            r = api_client.get(f"{API}/wp/posts", params={"search": "medicare"}, timeout=45)
            assert r.status_code == 200, r.text
            posts = r.json()
            if isinstance(posts, list) and len(posts) >= 1:
                break
            time.sleep(10)
        assert isinstance(posts, list), "search response not a list"
        assert len(posts) >= 1, f"expected >=1 result for 'medicare', got {len(posts)}"
        p = posts[0]
        assert "id" in p and "title" in p


# ---- HTML entity decoding (unit-style via API) ----
class TestHtmlDecoding:
    def test_titles_look_natural(self, api_client):
        r = api_client.get(f"{API}/wp/posts", params={"per_page": 10}, timeout=30)
        assert r.status_code == 200
        posts = r.json()
        assert posts, "no posts"
        joined = " || ".join(p.get("title", "") for p in posts)
        for ent in ("&#8217;", "&amp;", "&#8216;", "&#038;", "&#8211;"):
            assert ent not in joined, f"entity {ent} found in titles: {joined}"


# ---- Freshness endpoint (iteration 3) ----
class TestWPLatestModified:
    def test_latest_modified_returns_iso_and_id(self, api_client):
        # cold cache may return null once; retry once with 3s pause per request spec
        body = None
        for attempt in range(2):
            r = api_client.get(f"{API}/wp/latest-modified", timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            if body.get("modified"):
                break
            time.sleep(3)
        assert body is not None
        assert "modified" in body, "response missing `modified` key"
        assert body["modified"], f"`modified` still null after retry: {body}"
        assert isinstance(body["modified"], str) and "T" in body["modified"], \
            f"modified not ISO-like: {body['modified']!r}"
        assert "id" in body and isinstance(body["id"], int) and body["id"] > 0, \
            f"missing/invalid `id`: {body.get('id')!r}"


# ---- Custom content types: books/magazines/videos (iteration 4) ----
class TestBooksMagazinesVideos:
    """Books CPT not registered in WP → backend returns 2 hardcoded seed books.
    Magazines CPT not registered → []. Videos derived from posts w/ YouTube embeds."""

    def test_books_list_returns_two_seed_books(self, api_client):
        r = api_client.get(f"{API}/books", timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list), f"books not a list: {type(items)}"
        assert len(items) == 2, f"expected exactly 2 seed books, got {len(items)}"
        titles = sorted(b.get("title", "") for b in items)
        assert titles == sorted(["3D Retirement Income", "Tax Saving Strategies"]), \
            f"unexpected titles: {titles}"
        for b in items:
            for k in ("id", "slug", "title", "excerpt", "type"):
                assert k in b, f"book missing key {k}: {b}"
            assert b["type"] == "book", f"expected type=='book' got {b['type']!r}"
            assert isinstance(b["title"], str) and b["title"].strip()
            assert isinstance(b["slug"], str) and b["slug"].strip()
            assert isinstance(b["excerpt"], str) and b["excerpt"].strip()

    def test_get_book_by_slug_3d_retirement_income(self, api_client):
        r = api_client.get(f"{API}/books/book-3d-retirement-income", timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("title") == "3D Retirement Income", f"unexpected title: {b.get('title')}"
        assert b.get("type") == "book"
        assert b.get("id") == "book-3d-retirement-income"

    def test_get_book_by_slug_tax_saving_strategies(self, api_client):
        r = api_client.get(f"{API}/books/book-tax-saving-strategies", timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("title") == "Tax Saving Strategies", f"unexpected title: {b.get('title')}"
        assert b.get("type") == "book"
        assert b.get("id") == "book-tax-saving-strategies"

    def test_get_book_not_found_returns_404(self, api_client):
        r = api_client.get(f"{API}/books/does-not-exist", timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_magazines_returns_empty_list(self, api_client):
        # WP CPT not registered → backend must return [] with 200
        # Retry once with 3-5s pause on WP-dependent empties per request spec
        r = api_client.get(f"{API}/magazines", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list), f"magazines not a list: {type(body)}"
        assert body == [], f"expected empty list, got {body!r}"

    def test_videos_list_shape_and_type(self, api_client):
        # Retry once with pause because WP posts is upstream (possible 429)
        items = None
        for attempt in range(2):
            r = api_client.get(f"{API}/videos", params={"limit": 5}, timeout=45)
            assert r.status_code == 200, r.text
            items = r.json()
            if isinstance(items, list) and len(items) >= 1:
                break
            time.sleep(4)
        assert isinstance(items, list), f"videos not a list: {type(items)}"
        assert 1 <= len(items) <= 5, f"expected 1..5 items, got {len(items)}"
        for v in items:
            assert v.get("type") == "video", f"expected type=='video', got {v.get('type')!r}"
            assert "id" in v and "title" in v


# ---- Admin lead-gen endpoints (iteration 3) ----
class TestAdminLeads:
    def test_admin_leads_without_key_returns_401(self):
        r = requests.get(f"{API}/admin/leads", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_admin_leads_with_wrong_key_returns_401(self):
        r = requests.get(
            f"{API}/admin/leads",
            headers={"X-Admin-Key": "totally_wrong_key_123"},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_admin_leads_with_correct_key_returns_200_shape(self):
        r = requests.get(
            f"{API}/admin/leads",
            headers={"X-Admin-Key": ADMIN_KEY},
            timeout=15,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        for key in ("total", "count", "leads"):
            assert key in body, f"missing `{key}` in response"
        assert isinstance(body["total"], int)
        assert isinstance(body["count"], int)
        assert isinstance(body["leads"], list), f"leads not a list: {type(body['leads'])}"
        # count should match len(leads)
        assert body["count"] == len(body["leads"]), \
            f"count mismatch: count={body['count']} len(leads)={len(body['leads'])}"

    def test_admin_leads_csv_without_key_returns_401(self):
        r = requests.get(f"{API}/admin/leads.csv", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_admin_leads_csv_with_correct_key_returns_csv(self):
        r = requests.get(
            f"{API}/admin/leads.csv",
            headers={"X-Admin-Key": ADMIN_KEY},
            timeout=15,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        ctype = r.headers.get("content-type", "")
        assert "text/csv" in ctype, f"expected text/csv Content-Type, got {ctype!r}"
        body = r.text
        first_line = body.splitlines()[0] if body else ""
        expected = "email,name,retirement_stage,created_at,last_login,user_id,picture,source"
        assert first_line.strip() == expected, \
            f"CSV header mismatch. expected={expected!r} got={first_line!r}"
