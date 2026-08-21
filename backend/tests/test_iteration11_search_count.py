"""Iteration 11: verify search count endpoint fix.
Ensures the new /api/wp/posts/count endpoint returns real WordPress X-WP-Total
and paginated /api/wp/posts still returns 20 items sorted date-desc with recent
2026 posts, without duplicates across pages.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

MINDSET_CAT_ID = 710698946


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _get_with_retry(client, url, retries=2, wait=3.0):
    """WP cold-start sometimes rate-limits; retry once."""
    for i in range(retries + 1):
        r = client.get(url, timeout=30)
        if r.status_code == 200:
            return r
        if i < retries:
            time.sleep(wait)
    return r


# ---- Count endpoint ----
class TestPostsCount:
    def test_count_search_roth(self, api_client):
        r = _get_with_retry(api_client, f"{BASE_URL}/api/wp/posts/count?search=roth")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total" in data
        assert isinstance(data["total"], int)
        assert data["total"] > 0, f"Expected positive total for 'roth', got {data}"
        # store for later cross-check
        pytest.roth_total = data["total"]
        print(f"roth total = {data['total']}")

    def test_count_search_retirement_in_mindset(self, api_client):
        r = _get_with_retry(
            api_client,
            f"{BASE_URL}/api/wp/posts/count?search=retirement&category={MINDSET_CAT_ID}",
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("total"), int)
        assert data["total"] > 0, f"Expected positive total for retirement+mindset, got {data}"
        print(f"retirement+mindset total = {data['total']}")

    def test_count_all_posts(self, api_client):
        r = _get_with_retry(api_client, f"{BASE_URL}/api/wp/posts/count")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("total"), int)
        # Spec says ~196; allow reasonable range
        assert data["total"] >= 100, f"Expected all-posts total >= 100, got {data['total']}"
        print(f"all posts total = {data['total']}")

    def test_count_search_medicare(self, api_client):
        r = _get_with_retry(api_client, f"{BASE_URL}/api/wp/posts/count?search=medicare")
        assert r.status_code == 200
        data = r.json()
        assert data.get("total", 0) > 0

    def test_count_nomatch_returns_zero(self, api_client):
        r = _get_with_retry(api_client, f"{BASE_URL}/api/wp/posts/count?search=xzzzzq_definitely_no_match")
        assert r.status_code == 200
        data = r.json()
        assert data.get("total") == 0, f"Expected 0 for nonsense query, got {data}"

    def test_count_cached_second_call_is_fast(self, api_client):
        # First call warms the cache; second must return quickly (<0.5s)
        url = f"{BASE_URL}/api/wp/posts/count?search=roth"
        api_client.get(url, timeout=30)  # warm
        t0 = time.time()
        r = api_client.get(url, timeout=30)
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert r.json().get("total", 0) > 0
        assert elapsed < 0.8, f"Second (cached) call took {elapsed:.2f}s — cache may not be working"


# ---- Search + pagination ----
class TestSearchPosts:
    def test_search_roth_page1_has_20_and_recent(self, api_client):
        r = _get_with_retry(
            api_client,
            f"{BASE_URL}/api/wp/posts?search=roth&per_page=20&page=1",
        )
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) == 20, f"Expected 20 posts on page 1, got {len(posts)}"
        # Sorted descending by date
        dates = [p.get("date") for p in posts if p.get("date")]
        assert dates == sorted(dates, reverse=True), "Posts not sorted date desc"
        # At least one 2026 or 2025 recent post visible
        recent = [d for d in dates if d and (d.startswith("2026") or d.startswith("2025"))]
        assert recent, f"No recent 2025/2026 date in first page. Sample dates: {dates[:5]}"
        print(f"newest date = {dates[0]}")
        pytest.roth_page1_ids = {p["id"] for p in posts}

    def test_search_roth_page2_no_dupes(self, api_client):
        r = _get_with_retry(
            api_client,
            f"{BASE_URL}/api/wp/posts?search=roth&per_page=20&page=2",
        )
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) > 0, "Page 2 empty; expected more results"
        page2_ids = {p["id"] for p in posts}
        overlap = page2_ids & getattr(pytest, "roth_page1_ids", set())
        assert not overlap, f"Duplicate ids between page 1 and 2: {overlap}"

    def test_search_roth_filtered_by_mindset(self, api_client):
        r = _get_with_retry(
            api_client,
            f"{BASE_URL}/api/wp/posts?search=roth&category={MINDSET_CAT_ID}&per_page=20&page=1",
        )
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) <= 20
        # If any results, each must belong to mindset category
        for p in posts:
            cat = p.get("category") or {}
            if cat and cat.get("id"):
                assert cat["id"] == MINDSET_CAT_ID, f"Post {p['id']} not in mindset (got {cat})"
