"""Backend tests for the Free Member Access gate on books and magazines.

Verifies:
  - /api/books and /api/books/{id}: gated for anonymous, unlocked for authed
  - /api/magazines and /api/magazines/{id}: same
  - /api/content/pdf/{id}: 401 anon, 200 authed, 404 unknown
  - /api/guides: unchanged (public, has pdf_url, no lock required)
  - /api/wp/home-feed: still public
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email():
    return f"gate-test-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def authed_token():
    """Register a fresh user and return the session token."""
    payload = {
        "first_name": "Gate",
        "last_name": "Tester",
        "email": _rand_email(),
        "phone": "+15551234",
        "password": "changeme123",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and "user" in data
    return data["session_token"]


@pytest.fixture(scope="module")
def authed_client(authed_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {authed_token}",
    })
    return s


# ---- /api/books ------------------------------------------------------------

class TestBooksGate:
    def test_books_anon_all_locked(self, anon_client):
        r = anon_client.get(f"{API}/books", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        for b in items:
            assert b.get("locked") is True, f"expected locked=True for {b.get('id')}"
            assert "pdf_url" not in b, f"pdf_url leaked in {b.get('id')}"
            assert "content_html" not in b, f"content_html leaked in {b.get('id')}"
            # public preview fields still present
            assert b.get("id") and b.get("title")

    def test_books_authed_all_unlocked(self, authed_client):
        r = authed_client.get(f"{API}/books", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        for b in items:
            assert b.get("locked") is False, f"expected locked=False for {b.get('id')}"
            pdf = b.get("pdf_url")
            assert pdf and pdf.startswith("/api/content/pdf/"), f"bad pdf_url for {b.get('id')}: {pdf}"

    def test_book_detail_anon(self, anon_client):
        r = anon_client.get(f"{API}/books/book-3d-retirement-income", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "book-3d-retirement-income"
        assert d.get("locked") is True
        assert "pdf_url" not in d
        assert "content_html" not in d

    def test_book_detail_authed(self, authed_client):
        r = authed_client.get(f"{API}/books/book-3d-retirement-income", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("locked") is False
        assert d.get("pdf_url") == "/api/content/pdf/book-3d-retirement-income"

    def test_magazine_via_books_fallback_anon(self, anon_client):
        # book-detail endpoint also returns magazines by id (shared reader route)
        for mid in ("mag-evergreen-1", "mag-rmag-vol-1"):
            r = anon_client.get(f"{API}/books/{mid}", timeout=30)
            assert r.status_code == 200, f"{mid}: {r.status_code}"
            d = r.json()
            assert d.get("locked") is True
            assert "pdf_url" not in d
            assert "content_html" not in d

    def test_magazine_via_books_fallback_authed(self, authed_client):
        for mid in ("mag-evergreen-1", "mag-rmag-vol-1"):
            r = authed_client.get(f"{API}/books/{mid}", timeout=30)
            assert r.status_code == 200, f"{mid}: {r.status_code}"
            d = r.json()
            assert d.get("locked") is False
            assert d.get("pdf_url") == f"/api/content/pdf/{mid}"


# ---- /api/magazines --------------------------------------------------------

class TestMagazinesGate:
    def test_magazines_anon(self, anon_client):
        r = anon_client.get(f"{API}/magazines", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        for m in items:
            assert m.get("locked") is True
            assert "pdf_url" not in m
            assert "content_html" not in m

    def test_magazines_authed(self, authed_client):
        r = authed_client.get(f"{API}/magazines", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        for m in items:
            assert m.get("locked") is False
            pdf = m.get("pdf_url")
            assert pdf and pdf.startswith("/api/content/pdf/")

    def test_magazine_detail_anon(self, anon_client):
        r = anon_client.get(f"{API}/magazines/mag-evergreen-1", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("locked") is True
        assert "pdf_url" not in d
        assert "content_html" not in d

    def test_magazine_detail_authed(self, authed_client):
        r = authed_client.get(f"{API}/magazines/mag-evergreen-1", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("locked") is False
        assert d.get("pdf_url") == "/api/content/pdf/mag-evergreen-1"


# ---- /api/content/pdf/{id} -------------------------------------------------

class TestContentPdf:
    def test_pdf_anon_returns_401(self, anon_client):
        r = anon_client.get(f"{API}/content/pdf/book-3d-retirement-income",
                            allow_redirects=False, timeout=30)
        assert r.status_code == 401

    def test_pdf_authed_returns_pdf(self, authed_token):
        # Use raw request with Range header so we only fetch a small slice
        headers = {
            "Authorization": f"Bearer {authed_token}",
            "Range": "bytes=0-1023",
        }
        r = requests.get(f"{API}/content/pdf/book-3d-retirement-income",
                         headers=headers, timeout=60, stream=True)
        # Server may either honor Range (206) or return 200 with full stream;
        # accept both.
        assert r.status_code in (200, 206), f"got {r.status_code}"
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct.lower(), f"content-type={ct}"
        # Read only a small slice then close
        chunk = next(r.iter_content(chunk_size=1024), b"")
        r.close()
        assert chunk and chunk.startswith(b"%PDF"), "response is not a PDF"

    def test_pdf_authed_unknown_id_404(self, authed_client):
        r = authed_client.get(f"{API}/content/pdf/does-not-exist", timeout=30)
        assert r.status_code == 404

    def test_pdf_magazine_authed(self, authed_token):
        headers = {
            "Authorization": f"Bearer {authed_token}",
            "Range": "bytes=0-511",
        }
        r = requests.get(f"{API}/content/pdf/mag-evergreen-1",
                         headers=headers, timeout=60, stream=True)
        assert r.status_code in (200, 206)
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        r.close()


# ---- /api/guides (public, unchanged) --------------------------------------

class TestGuidesPublic:
    def test_guides_anon_has_pdf_url_no_lock(self, anon_client):
        r = anon_client.get(f"{API}/guides", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        # Guides remain public — they must still carry pdf_url and NOT be locked
        for g in items[:5]:
            assert g.get("pdf_url"), f"guide {g.get('id')} missing pdf_url"
            # locked flag either absent or explicitly False
            assert not g.get("locked"), f"guide {g.get('id')} unexpectedly locked"


# ---- /api/wp/home-feed (public, unchanged) --------------------------------

class TestHomeFeedPublic:
    def test_home_feed_anon_ok(self, anon_client):
        r = anon_client.get(f"{API}/wp/home-feed", timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Basic structural sanity — should return keys even if arrays empty
        for key in ("hero", "videos", "trending", "recommended", "tip"):
            assert key in d, f"missing {key} in home-feed"
