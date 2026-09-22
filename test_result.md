# RetireMentorship — Test Result

## user_problem_statement
Add a free member-access structure to RetireMentorship so books and magazines
require a signed-in account to unlock the reader. Public content (articles,
videos, calculators, tips, guides) remains accessible without signing in.
Signed-out users must see a polished gate ("Your next chapter starts here.")
with primary "Create Free Account" and secondary "Sign In" buttons; dismiss
returns to browsing. After auth, the user must land back on the exact book
or magazine they were viewing. Signing out immediately re-locks readers,
deep links, and any cached / downloaded content. Backend must enforce the
gate — public listing endpoints return preview-only metadata without
`pdf_url` or `content_html`; the authenticated proxy stream is the only way
to fetch the actual PDF bytes.

## Backend testing notes
- Books and magazines list + detail must return `locked: true` and omit
  `pdf_url`, `content_html` for anonymous callers.
- Authenticated callers must receive `pdf_url = "/api/content/pdf/<id>"`
  and `locked: false`.
- `/api/content/pdf/{id}` must:
  - Return 401 for anonymous callers.
  - Stream the PDF bytes for authenticated callers (Content-Type PDF).
  - Return 404 for unknown ids and 403 for allow-listed-host mismatches.
- Guides, articles, tips, home feed, videos remain public with no changes.

## Frontend testing notes
- Book/magazine detail with signed-out session: shows lock pill "Free
  Member Access", cover has lock badge, buttons replaced by AuthGate
  ("Your next chapter starts here." / "Create Free Account" / "Sign In"),
  the top-right bookmark control is hidden, dismiss (X) returns to
  previous.
- Reader route `/book/read/[id]` with signed-out session must redirect to
  `/book/[id]` (no reader visible, no way to load the PDF).
- After registering or signing in from the gate, user is returned to the
  original `/book/[id]` and the "Start reading" button appears.
- Signing out re-locks the same detail page (reader button disappears,
  gate appears) without a manual refresh.
- Book covers and magazine covers everywhere carry the lock badge when
  signed-out; magazine covers navigate to the detail page (not the
  reader) to enforce the gate.
- Home feed articles, tips, guides in Tools tab, videos in Learn remain
  unlocked.
