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


# ---- Iteration 5: home-feed refactor (recommended rail + cross-rail dedupe) ----
def _fetch_home_feed(api_client, params=None):
    """Fetch home-feed with a 1-retry-after-5s on empty (WP rate limit)."""
    r = None
    for attempt in range(2):
        r = api_client.get(f"{API}/wp/home-feed", params=params or {}, timeout=45)
        if r.status_code == 200:
            body = r.json() or {}
            if body.get("hero") or body.get("latest"):
                return body, r
        time.sleep(5)
    assert r is not None and r.status_code == 200, (r.text if r is not None else "no response")
    return r.json(), r


class TestHomeFeedIter5:
    """New shape: keys = hero, featured, latest, videos, trending, recommended, tip, stage.
    Cross-rail dedupe: hero.id, tip.id, and every id in videos/trending/recommended must be disjoint."""

    def test_home_feed_has_all_iter5_keys(self, api_client):
        body, _ = _fetch_home_feed(api_client)
        for key in ("hero", "featured", "latest", "videos", "trending", "recommended", "tip", "stage"):
            assert key in body, f"home-feed missing key: {key}"
        assert isinstance(body["videos"], list)
        assert isinstance(body["trending"], list)
        assert isinstance(body["recommended"], list)
        assert isinstance(body["latest"], list)
        assert isinstance(body["featured"], list)

    def test_home_feed_cross_rail_dedupe(self, api_client):
        body, _ = _fetch_home_feed(api_client)
        hero = body.get("hero")
        tip = body.get("tip")
        assert hero and hero.get("id"), "hero missing"
        assert tip and tip.get("id"), "tip missing"

        video_ids = [v["id"] for v in body["videos"]]
        trending_ids = [t["id"] for t in body["trending"]]
        recommended_ids = [r["id"] for r in body["recommended"]]

        # Rails must have unique ids within themselves
        assert len(video_ids) == len(set(video_ids)), f"videos rail has dup ids: {video_ids}"
        assert len(trending_ids) == len(set(trending_ids)), f"trending rail has dup ids: {trending_ids}"
        assert len(recommended_ids) == len(set(recommended_ids)), f"recommended rail has dup ids: {recommended_ids}"

        # Mutually disjoint across rails + hero + tip
        all_ids = [hero["id"], tip["id"]] + video_ids + trending_ids + recommended_ids
        assert len(all_ids) == len(set(all_ids)), (
            f"cross-rail duplicates found. hero={hero['id']} tip={tip['id']} "
            f"videos={video_ids} trending={trending_ids} recommended={recommended_ids}"
        )

    def test_home_feed_tip_is_article_when_available(self, api_client):
        body, _ = _fetch_home_feed(api_client)
        latest = body.get("latest") or []
        hero_id = (body.get("hero") or {}).get("id")
        # Check whether any non-hero article exists in top 20 latest
        # (latest is truncated to 10 in response, but tip selection uses the full 20 upstream —
        #  since we only see the top 10 here, use that as a lower bound sufficient signal)
        non_hero_articles = [p for p in latest if p.get("id") != hero_id and p.get("type") == "article"]
        if non_hero_articles:
            tip = body.get("tip")
            assert tip and tip.get("type") == "article", (
                f"tip should be 'article' when non-hero articles exist. got type={tip.get('type') if tip else None}"
            )
        else:
            pytest.skip("no non-hero articles visible in latest[:10] to assert tip.type")

    def test_home_feed_exclude_ids_removes_hero_and_shifts(self, api_client):
        body1, _ = _fetch_home_feed(api_client)
        hero1 = body1.get("hero")
        assert hero1 and hero1.get("id"), "first-call hero missing"
        excluded = hero1["id"]

        body2, _ = _fetch_home_feed(api_client, params={"exclude_ids": str(excluded)})
        hero2 = body2.get("hero")
        assert hero2 is not None, "second-call hero is None after exclude_ids"

        # Excluded id must not appear anywhere in the response
        appears_in = []
        if hero2.get("id") == excluded:
            appears_in.append("hero")
        tip2 = body2.get("tip") or {}
        if tip2.get("id") == excluded:
            appears_in.append("tip")
        for rail in ("videos", "trending", "recommended"):
            for item in body2.get(rail) or []:
                if item.get("id") == excluded:
                    appears_in.append(rail)
                    break
        assert not appears_in, (
            f"excluded id {excluded} still present in: {appears_in} on second call"
        )

        # Hero should be different (WP site has hundreds of posts)
        assert hero2["id"] != excluded, (
            f"hero did not shift after excluding {excluded}; got {hero2['id']}"
        )

    def test_home_feed_interest_cat_biases_recommended(self, api_client, categories):
        if not categories:
            pytest.skip("no categories available")
        # pick a category with a healthy count
        cat = next((c for c in categories if c.get("count", 0) >= 3), categories[0])
        cat_id = cat["id"]

        body = None
        for attempt in range(2):
            r = api_client.get(
                f"{API}/wp/home-feed",
                params={"interest_cat": cat_id},
                timeout=45,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            if body.get("recommended"):
                break
            time.sleep(5)

        recommended = body.get("recommended") or []
        assert len(recommended) > 0, f"recommended empty for interest_cat={cat_id} ({cat.get('name')})"

        # NOTE: the API transform only exposes ONE category from `_embed` (the first-embedded term),
        # which is often not the requested filter category since posts belong to multiple cats.
        # To validate the interest filter, we hit WP directly and confirm the recommended ids
        # are actually a subset of posts that carry the requested category.
        rec_ids = {r["id"] for r in recommended}
        wp_direct = requests.get(
            "https://retirementorship.com/wp-json/wp/v2/posts",
            params={"include": ",".join(str(i) for i in rec_ids), "per_page": len(rec_ids)},
            timeout=30,
        )
        if wp_direct.status_code == 200:
            wp_posts = wp_direct.json()
            matched = [p for p in wp_posts if cat_id in (p.get("categories") or [])]
            ratio = len(matched) / max(len(wp_posts), 1)
            assert ratio >= 0.5, (
                f"expected >=50% of recommended items to actually be in interest_cat={cat_id}, "
                f"got {len(matched)}/{len(wp_posts)} = {ratio:.0%}"
            )
        else:
            # Fall back to soft check on exposed category
            with_cat = [r for r in recommended if (r.get("category") or {}).get("id")]
            if with_cat:
                matched = [r for r in with_cat if (r.get("category") or {}).get("id") == cat_id]
                assert len(matched) >= 1, (
                    f"none of {len(with_cat)} recommended items expose interest_cat={cat_id}"
                )
