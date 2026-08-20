"""
RetireMentorship Iteration 6 tests.

Covers:
- GET /api/books: every seeded book has a non-empty `pdf_url` string
- GET /api/books/book-3d-retirement-income: exact pdf_url match
- 401 gating on book-progress endpoints (list, single, upsert) without Authorization
- Regressions:
    * /api/books returns exactly 2 books
    * /api/wp/home-feed returns hero + recommended keys
    * /api/wp/home-feed?exclude_ids=<hero_id> rotates hero and excludes id from all rails
    * /api/admin/leads gated by X-Admin-Key: rm_admin_ChangeMe_2026
    * /api/wp/latest-modified returns `modified` + `id`
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://wisdom-edge.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "rm_admin_ChangeMe_2026")

EXPECTED_3D_PDF = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fetch_home_feed(api_client, params=None):
    """Home-feed with retry once on empty (WP rate limit)."""
    r = None
    for _ in range(2):
        r = api_client.get(f"{API}/wp/home-feed", params=params or {}, timeout=45)
        if r.status_code == 200:
            body = r.json() or {}
            if body.get("hero") or body.get("latest"):
                return body, r
        time.sleep(5)
    assert r is not None and r.status_code == 200, (r.text if r is not None else "no response")
    return r.json(), r


# ---- Books + pdf_url (iter 6) ----
class TestBooksPdfUrl:
    def test_books_list_returns_two_and_all_have_pdf_url(self, api_client):
        r = api_client.get(f"{API}/books", timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list), f"books not a list: {type(items)}"
        assert len(items) == 2, f"expected exactly 2 seed books, got {len(items)}"
        for b in items:
            assert "pdf_url" in b, f"book missing pdf_url key: {b}"
            pdf = b.get("pdf_url")
            assert isinstance(pdf, str) and pdf.strip(), (
                f"pdf_url must be a non-empty string. book_id={b.get('id')!r} pdf_url={pdf!r}"
            )
            assert pdf.startswith("http"), f"pdf_url not an http URL: {pdf!r}"

    def test_book_3d_retirement_income_pdf_url_exact(self, api_client):
        r = api_client.get(f"{API}/books/book-3d-retirement-income", timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("id") == "book-3d-retirement-income"
        assert b.get("pdf_url") == EXPECTED_3D_PDF, (
            f"pdf_url mismatch. expected={EXPECTED_3D_PDF!r} got={b.get('pdf_url')!r}"
        )


# ---- 401 gating on book-progress endpoints (iter 6) ----
class TestBookProgressAuthGuards:
    def test_list_without_auth_returns_401(self):
        r = requests.get(f"{API}/user/book-progress", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_single_without_auth_returns_401(self):
        r = requests.get(f"{API}/user/book-progress/some-id", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_upsert_without_auth_returns_401(self):
        r = requests.post(
            f"{API}/user/book-progress",
            json={"book_id": "book-3d-retirement-income", "page": 3, "total_pages": 14},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_list_with_bad_bearer_returns_401(self):
        r = requests.get(
            f"{API}/user/book-progress",
            headers={"Authorization": "Bearer nonsense_token_xyz"},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# ---- Regressions ----
class TestRegressions:
    def test_books_count_is_two(self, api_client):
        r = api_client.get(f"{API}/books", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_home_feed_has_hero_and_recommended(self, api_client):
        body, _ = _fetch_home_feed(api_client)
        assert "hero" in body, "home-feed missing hero"
        assert "recommended" in body, "home-feed missing recommended"
        assert body["hero"] is not None, "hero is None"
        assert isinstance(body["recommended"], list), "recommended not a list"

    def test_home_feed_exclude_ids_rotates_hero(self, api_client):
        body1, _ = _fetch_home_feed(api_client)
        hero1 = body1.get("hero")
        assert hero1 and hero1.get("id"), "first-call hero missing"
        excluded = hero1["id"]

        body2, _ = _fetch_home_feed(api_client, params={"exclude_ids": str(excluded)})
        hero2 = body2.get("hero")
        assert hero2 is not None, "second-call hero is None after exclude_ids"
        assert hero2.get("id") != excluded, (
            f"hero did not rotate after excluding {excluded}"
        )

        # excluded id absent from all rails
        appears_in = []
        tip2 = body2.get("tip") or {}
        if tip2.get("id") == excluded:
            appears_in.append("tip")
        for rail in ("videos", "trending", "recommended", "featured"):
            for item in body2.get(rail) or []:
                if item.get("id") == excluded:
                    appears_in.append(rail)
                    break
        assert not appears_in, (
            f"excluded id {excluded} still present in rails: {appears_in}"
        )

    def test_admin_leads_without_key_returns_401(self):
        r = requests.get(f"{API}/admin/leads", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_admin_leads_wrong_key_returns_401(self):
        r = requests.get(f"{API}/admin/leads", headers={"X-Admin-Key": "wrong"}, timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_admin_leads_correct_key_returns_200(self):
        r = requests.get(
            f"{API}/admin/leads", headers={"X-Admin-Key": ADMIN_KEY}, timeout=15
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        for key in ("total", "count", "leads"):
            assert key in body, f"missing key {key}"
        assert isinstance(body["leads"], list)

    def test_latest_modified_returns_modified_and_id(self, api_client):
        body = None
        for _ in range(2):
            r = api_client.get(f"{API}/wp/latest-modified", timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            if body.get("modified"):
                break
            time.sleep(5)
        assert body is not None
        assert "modified" in body and body["modified"], f"missing modified: {body}"
        assert isinstance(body["modified"], str) and "T" in body["modified"], (
            f"modified not ISO-like: {body['modified']!r}"
        )
        assert "id" in body and isinstance(body["id"], int) and body["id"] > 0, (
            f"missing/invalid id: {body.get('id')!r}"
        )
