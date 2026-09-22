# RetireMentorship — Product Requirements & Build Notes

## Vision
The #1 retirement education mobile app. Educates first, generates qualified leads second.

Tagline: **"Retire Successfully. Stay Successfully Retired."**
Sub-tagline: **"Your mentor to and through retirement."**

## Content pipeline — WordPress is the source of truth
- Articles/categories/videos from `https://retirementorship.com/wp-json/wp/v2/*`.
- Backend proxy with 3-min cache, 429 stale-fallback.
- Frontend stale-while-revalidate: instant paint from cache, refresh on mount + on foreground.

## Books — in-app PDF reader (this iteration)
- Every book carries a `pdf_url`. Two seeded books today (with sample PDFs):
  - **3D Retirement Income** — 14-page sample from Mozilla
  - **Tax Saving Strategies** — W3C dummy PDF
- **Reader**: `/book/read/[id]` — WebView + PDF.js on native (works in Expo Go); iframe fallback on web preview.
- **Page tracking**: IntersectionObserver watches which canvas is >40% visible → posts `{type:'page', page, total}` back to RN → throttled (1.5s) save to `bookProgress` store.
- **Offline reading**: uses the existing `downloads` module. Tap the cloud-download icon in the reader top bar → PDF is saved to device via `expo-file-system`; next open uses `file://` URL automatically.
- **Progress store** (`src/offline/book-progress.ts`):
  - Local-first (`AsyncStorage rm.book_progress.v1`), page + total_pages + updated_at_ms + dirty flag.
  - Fire-and-forget POST to `/api/user/book-progress` after every save.
  - `pushDirty()` runs on login + on Home mount; `syncFromServer()` runs on Learn mount and book detail focus.
  - Last-write-wins by `updated_at_ms` on both sides.
- **Progress bar** rendered inside every `BookCover` (Home rail, Learn bookshelf, book detail). Book detail also shows "Continue on page N" label + reading-progress chip + offline-size chip.
- **Server endpoints** (bearer auth): `GET /api/user/book-progress`, `GET /api/user/book-progress/{book_id}`, `POST /api/user/book-progress { book_id, page, total_pages, updated_at }`.

## Home rails (deduplicated + history-aware)
`/api/wp/home-feed` guarantees mutual-disjoint rails and accepts `exclude_ids`, `interest_cat`.
Rendered: Hero · Today's Tip · Books · Continue Reading · Watch & Learn · Trending · Magazines · Advisor CTA · Recommended.

## Learn tab
Chip sections: **Bookshelf**, **Courses**, **Magazines**, **Videos**. Bookshelf renders each book with its current progress bar and page count.

### Courses (WP tag-driven)
- Every WordPress tag with **≥ 2 published posts** becomes a Course automatically. Ordered chronologically by the earliest lesson.
- Backend: `GET /api/courses` (list w/ `lesson_ids` for progress) · `GET /api/courses/{tag_id}` (detail w/ full lessons, ordered oldest→newest).
- Frontend: `Learn → Courses` chip renders each course card with cover, description, lesson count, and a live progress bar tied to `useCompleted()` global state.
- **Course detail** `/course/[id]`: hero + progress bar + chronological lesson list (numbered), each with thumb / duration / type · "mark complete" checkbox inline · bookmark support (`course-{tag_id}`) · tap opens the article/video reader.

## Tools
Compound Interest, Social Security Taxability, Mortgage.

## Lead generation
- Google sign-in stores email + name + picture + retirement stage.
- Admin export: `/api/admin/leads` / `/api/admin/leads.csv` gated by `X-Admin-Key`.
- Optional webhook: `LEADS_WEBHOOK_URL` fires on new signup.
- CTA: **"Book a discovery meeting"** → `https://calendly.com/flinde/discovery`.

## Design system
Warm cream + gold + deep purple. Radius sm 12 · md 20 · lg 28 · xl 36. Floating pill tab bar. Body 17pt, headline 30pt, letter-spacing -0.6. Reader UI uses charcoal `#231F20` chrome for dedicated reading.

## Member access (Sep 2026)
Books and magazines require a signed-in account to unlock the reader. Public
content (articles, videos, calculators, tips, guides) stays fully accessible.
- **Backend**: `/api/books`, `/api/books/{id}`, `/api/magazines`, `/api/magazines/{id}` accept an optional `Authorization` header. Signed-out callers get preview metadata + `locked: true` and never see `pdf_url` / `content_html`. Signed-in callers receive `pdf_url: /api/content/pdf/<id>` (a member-only proxy) and `locked: false`.
- **Proxy delivery**: `GET /api/content/pdf/{id}` — Bearer auth required, streams the PDF via httpx from the CDN. Allow-list hosts guard against open-proxy abuse.
- **Frontend gate**: `src/components/AuthGate.tsx` — polished purple gradient card ("Your next chapter starts here.") with "Create Free Account" + "Sign In" and a dismiss (X). Rendered inline on `/book/[id]` when the item is locked; hides the reader/bookmark/complete controls.
- **Return-to-book**: login and register accept `next` and `nextId` query params (from the gate) and prefer `router.back()` after auth so the user lands back on the exact detail page.
- **Sign-out lock**: `signOut` in `src/context/auth.tsx` purges the books/magazines caches and deletes any downloaded book/magazine PDFs from `expo-file-system` so a local file cannot bypass the gate.
- **Sign-in refresh**: `applySession` purges caches before setting the user; the book detail effect clears its local state on `[id, user]` change and re-fetches so the fresh authed payload always wins.
- **Known limitation**: source PDFs still live on the public `customer-assets-…` CDN. Anyone who already has the direct URL can retrieve the file. The proxy only guarantees the app never leaks those URLs. Full end-to-end protection needs migrating those PDFs to signed-URL storage.

## Offline layer
`src/offline/cache.ts` (staleWhileRevalidate), `progress.ts` (article scroll progress → Continue Reading), `downloads.ts` (expo-file-system registry — used for PDFs), `book-progress.ts` (page-based reading progress + server sync).

## Env
- Backend: `MONGO_URL`, `DB_NAME`, `ADMIN_API_KEY`, `LEADS_WEBHOOK_URL`
- Frontend: `EXPO_PUBLIC_BACKEND_URL`
- Calendly URL configurable in `/app/frontend/src/theme.ts`

## Phase 2 backlog
- Register `book`, `magazine`, `video` CPTs in WordPress so real content flows in
- Native interactive calculators (in-app Compound Interest / SS taxability / Mortgage)
- Magazine flipbook viewer
- Push notifications (Emergent-managed)
- AI retirement coach (Claude via Emergent key)
- Flowchart pinch-zoom viewer
- Advisor directory, workshop registration
