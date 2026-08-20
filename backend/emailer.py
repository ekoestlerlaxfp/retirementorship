"""
RetireMentorship — Emergent-managed Resend transactional email helper.

- No user API key: authenticated via EMERGENT_EMAIL_KEY that Emergent provisions.
- Every send passes through the G2/G3 structural guardrails in `_assert_safe_email`.
- Templates live in this module so the callers only pass IDs (never markup).
"""

import os
import re
import ipaddress
import logging
import asyncio
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Emergent managed email proxy — a CONSTANT (deliberately not read from env)
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "RetireMentorship")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")  # optional

# ---- Guardrails ----------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


# ---- Send helper ---------------------------------------------------------
async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    if not EMAIL_KEY:
        logger.error("EMERGENT_EMAIL_KEY missing; cannot send email")
        raise RuntimeError("Email service not configured")

    payload = {
        "to": [to],
        "subject": subject,
        "html": html,
        "from_name": EMAIL_FROM_NAME,
    }
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise


# ---- Templates -----------------------------------------------------------
def _wrap(inner_html: str, footer_note: str = "") -> str:
    """Table-based, inline-CSS email chrome with brand colors."""
    footer = footer_note or (
        "You're receiving this because you signed up on RetireMentorship. "
        "We never ask for your password or account details by email."
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:#F5EDDF;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
        f'<tr><td align="center">'
        f'<table role="presentation" width="560" cellpadding="0" cellspacing="0" '
        f'style="max-width:560px;background:#FFFDFA;border-radius:16px;'
        f'border:1px solid #E7DAC1;overflow:hidden">'
        f'<tr><td style="padding:28px 32px 8px">'
        f'<div style="font-size:12px;letter-spacing:2px;color:#4B3166;font-weight:800">'
        f'{escape(EMAIL_FROM_NAME).upper()}</div>'
        f'</td></tr>'
        f'<tr><td style="padding:8px 32px 24px;color:#231F20;font-size:16px;line-height:24px">'
        f'{inner_html}</td></tr>'
        f'<tr><td style="padding:16px 32px 28px;color:#8B7B63;font-size:12px;line-height:18px;'
        f'border-top:1px solid #EFE4CD">{escape(footer)}</td></tr>'
        f'</table></td></tr></table>'
    )


async def send_verification_email(to: str, first_name: str, code: str) -> str | None:
    subject = f"Your {EMAIL_FROM_NAME} verification code"
    inner = (
        f'<p>Hi {escape(first_name)},</p>'
        f'<p>Welcome to {escape(EMAIL_FROM_NAME)} — the retirement education library.</p>'
        f'<p>Enter this code in the app to confirm your email:</p>'
        f'<p style="text-align:center;margin:24px 0">'
        f'<span style="display:inline-block;font-size:28px;letter-spacing:8px;font-weight:800;'
        f'color:#4B3166;background:#F0E7D2;border:1px solid #E7DAC1;border-radius:12px;'
        f'padding:16px 24px">{escape(code)}</span>'
        f'</p>'
        f'<p style="color:#6B5D4A;font-size:14px">This code expires in 10 minutes. '
        f'If you did not create an account, you can safely ignore this email.</p>'
    )
    return await send_email(to=to, subject=subject, html=_wrap(inner))


async def send_password_reset_email(to: str, first_name: str, code: str) -> str | None:
    subject = f"Reset your {EMAIL_FROM_NAME} password"
    inner = (
        f'<p>Hi {escape(first_name)},</p>'
        f'<p>Use this code in the app to reset your password:</p>'
        f'<p style="text-align:center;margin:24px 0">'
        f'<span style="display:inline-block;font-size:28px;letter-spacing:8px;font-weight:800;'
        f'color:#4B3166;background:#F0E7D2;border:1px solid #E7DAC1;border-radius:12px;'
        f'padding:16px 24px">{escape(code)}</span>'
        f'</p>'
        f'<p style="color:#6B5D4A;font-size:14px">This code expires in 10 minutes. '
        f'If you did not request a reset, ignore this email — your password stays the same.</p>'
    )
    return await send_email(to=to, subject=subject, html=_wrap(inner))
