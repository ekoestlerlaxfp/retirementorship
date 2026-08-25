"""Iteration 13 — verify server-side YouTube/Vimeo video_id extraction.

Fix under test:
- transform_post() now extracts video_id + video_kind from WP post content HTML.
- /api/videos returns items whose type=="video" all have non-empty video_id and video_kind=="youtube".
- /api/wp/posts/16163 returns the specific known-good video_id "pNxobWWrWys".
- Non-video posts should have video_id/video_kind == None (or omitted).
"""

import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- /api/videos ----------------
class TestVideosEndpoint:
    def test_videos_returns_shape(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/videos", params={"page": 1, "limit": 5}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        assert "items" in data
        assert "has_more" in data
        assert "page" in data
        assert isinstance(data["items"], list)
        assert data["page"] == 1

    def test_every_video_has_video_id_and_kind(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/videos", params={"page": 1, "limit": 5}, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json().get("items") or []
        assert len(items) > 0, "expected at least 1 video from WP"
        for it in items:
            assert it.get("type") == "video", f"unexpected type: {it.get('type')} for id={it.get('id')}"
            vid = it.get("video_id")
            kind = it.get("video_kind")
            assert isinstance(vid, str) and len(vid) >= 6, f"bad video_id={vid!r} for post {it.get('id')}"
            assert kind in ("youtube", "vimeo"), f"bad video_kind={kind!r} for post {it.get('id')}"
            # Almost all RM videos are YouTube in practice.
        # At least one should be youtube
        assert any(it.get("video_kind") == "youtube" for it in items)


# ---------------- /api/wp/posts/16163 ----------------
class TestKnownVideoPost:
    def test_post_16163_has_expected_video_id(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/wp/posts/16163", timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p.get("id") == 16163
        assert p.get("type") == "video"
        assert p.get("video_kind") == "youtube"
        assert p.get("video_id") == "pNxobWWrWys", f"expected 'pNxobWWrWys', got {p.get('video_id')!r}"


# ---------------- /api/wp/posts sanity: non-video posts have null fields ----------------
class TestNonVideoPostsHaveNullFields:
    def test_non_video_posts_have_null_video_fields(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/wp/posts", params={"per_page": 20}, timeout=30)
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list) and len(posts) > 0
        # Assert every article-type post has null video_id/kind, and every video-type post has both set.
        for p in posts:
            if p.get("type") == "article":
                assert p.get("video_id") in (None, ""), f"article post {p.get('id')} unexpectedly has video_id {p.get('video_id')!r}"
                assert p.get("video_kind") in (None, ""), f"article post {p.get('id')} unexpectedly has video_kind {p.get('video_kind')!r}"
            elif p.get("type") == "video":
                assert isinstance(p.get("video_id"), str) and len(p["video_id"]) >= 6
                assert p.get("video_kind") in ("youtube", "vimeo")


# ---------------- Unit-ish tests for the extractor over multiple URL shapes ----------------
# The extractor lives inside the backend; we test it via /api/videos results plus a live import.
class TestExtractorPatterns:
    """Import the extractor directly and confirm all documented URL shapes are handled."""

    @pytest.fixture(scope="class")
    def extractor(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _extract_video  # type: ignore
        return _extract_video

    @pytest.mark.parametrize("html,expected", [
        ('<iframe src="https://www.youtube.com/embed/abcDEF12345"></iframe>', ("youtube", "abcDEF12345")),
        ('<a href="https://youtu.be/xyz789ABCDE">watch</a>', ("youtube", "xyz789ABCDE")),
        ('<a href="https://www.youtube.com/watch?v=pNxobWWrWys&feature=share">link</a>', ("youtube", "pNxobWWrWys")),
        ('<iframe src="https://www.youtube-nocookie.com/embed/QRstuVWX_-1"></iframe>', ("youtube", "QRstuVWX_-1")),
        ('<iframe src="https://player.vimeo.com/video/76543210"></iframe>', ("vimeo", "76543210")),
        ('<p>Just text, no video here.</p>', (None, None)),
        ('', (None, None)),
    ])
    def test_extractor_url_variants(self, extractor, html, expected):
        kind, vid = extractor(html)
        assert (kind, vid) == expected, f"input={html!r} → got ({kind!r}, {vid!r})"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
