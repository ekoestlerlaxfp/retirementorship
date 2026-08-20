# RetireMentorship — Product Requirements & Build Notes

## Vision
The #1 retirement education mobile app. Not a financial planner app — an elegant, calming, MasterClass-quality learning platform for people 50–75. Educates first, generates qualified leads second.

Tagline: **"Retire Successfully. Stay Successfully Retired."**
Sub-tagline (onboarding): **"Your mentor to and through retirement."**

## Content pipeline — WordPress is the source of truth
- All articles, videos, categories flow from `https://retirementorship.com/wp-json/wp/v2/*`.
- Backend proxies with a 3-min in-memory cache, 429 stale-fallback.
- `GET /api/wp/latest-modified` gives the newest post's `modified` timestamp for cheap freshness checks.
- Stale-while-revalidate on every screen: instant paint from cache, then refresh on mount AND on foreground.

## Custom content types
- **Books** (`GET /api/books`, `GET /api/books/{id}`): tries WP CPT `book`, falls back to two seeded books wired today:
  - `3D Retirement Income` (purple gradient cover)
  - `Tax Saving Strategies` (gold gradient cover)
  When you register a `book` CPT in WordPress, the backend picks it up automatically and seed data drops out.
- **Magazines** (`GET /api/magazines`): tries WP CPT `magazine`, returns `[]` until you register the CPT. UI hides the rail while empty.
- **Videos** (`GET /api/videos?limit=N`): tries WP CPT `video`, else synthesises from posts that embed YouTube/Vimeo.

## Lead generation
- Every Google sign-in stores email + name + picture + retirement stage.
- Admin export: `GET /api/admin/leads` (JSON) and `/api/admin/leads.csv` (CSV) gated by `X-Admin-Key` header (`.env` `ADMIN_API_KEY`).
- Optional webhook: `LEADS_WEBHOOK_URL` fires POST on new signup.
- Calendly CTA cards throughout the app.

## User flows (Phase 1 delivered)
1. Guest onboarding → pick retirement stage → Home
2. Home rails → hero · Today's Tip · **Books from RetireMentorship** · Continue Reading · Latest · Videos · Trending · Magazines (when populated) · Advisor CTA · Recommended
3. Book detail (`/book/[id]`) — beautiful gradient cover, chapters + reading-time chips, excerpt, "Start reading" (when content published) or "Coming soon" state, "Talk to a mentor about this" CTA
4. Learn → categories tiles + full grid
5. Category → 2-column article grid
6. Article reader → hero/YouTube, HTML body, bookmark, share, save-for-offline, scroll-driven reading progress, advisor CTA
7. Global search → debounced WP full-text
8. Tools → 3 live calculators. RMD & Roth = "Soon"
9. Library → Bookmarks / History
10. Profile → Google sign-in, Downloads & storage, advisor CTA
11. Downloads & storage — cached size, downloaded files, reading-progress count

## Design system (Apple 2026 look)
- Palette: warm cream, gold, deep purple. Radius sm 12 · md 20 · lg 28 · xl 36.
- Floating pill tab bar (rounded 28) with gold-tinted glass. Softer, deeper shadows.
- Body 17pt, headline 30pt, hero 32pt, letter-spacing -0.6.
- Gold RM monogram in onboarding hero, home header, profile footer, and every book cover as gold-foil accent.

## Offline layer
- `src/offline/cache.ts` — JSON KV cache w/ `staleWhileRevalidate`
- `src/offline/progress.ts` — per-post scroll progress → Continue Reading rail
- `src/offline/downloads.ts` — expo-file-system registry (ready for magazine PDFs, book chapters)

## Env
- Backend: `MONGO_URL`, `DB_NAME`, `ADMIN_API_KEY`, `LEADS_WEBHOOK_URL`
- Frontend: `EXPO_PUBLIC_BACKEND_URL`
- Calendly URL configurable in `/app/frontend/src/theme.ts`

## Phase 2 backlog
- Native interactive calculators (RMD, Roth, Retirement Income)
- Full book reader (chapter list, in-app text) once WP `book` CPT is populated
- Magazine flipbook viewer once WP `magazine` CPT is populated
- Push notifications (Emergent-managed)
- AI retirement coach (Claude via Emergent key)
- Flowchart pinch-zoom viewer
- Advisor directory, workshop registration
