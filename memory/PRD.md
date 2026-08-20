# RetireMentorship — Product Requirements & Build Notes

## Vision
The #1 retirement education mobile app. Educates first, generates qualified leads second.

Tagline: **"Retire Successfully. Stay Successfully Retired."**
Sub-tagline: **"Your mentor to and through retirement."**

## Content pipeline — WordPress is the source of truth
- All content flows from `https://retirementorship.com/wp-json/wp/v2/*`.
- Backend proxies with 3-min in-memory cache, 429 stale-fallback.
- Frontend stale-while-revalidate: instant paint from cache, refresh on mount + on foreground.

## Home rails (deduplicated + history-aware)
Backend `/api/wp/home-feed` guarantees **mutual-disjoint** rails and accepts:
- `exclude_ids=<csv of post_ids>` — frontend passes local viewing history to skip already-seen content
- `interest_cat=<category id>` — biases `recommended` to a category
- Returns: `hero, tip, videos[], trending[], recommended[], featured[], latest[], stage`
Frontend Home renders: Hero (newest) · Today's Tip (next article) · Books · Continue Reading · Watch & Learn (newest videos, hero excluded) · Trending · Magazines (when populated) · Advisor CTA · Recommended (page-2 archive or interest-based)
**Removed**: "Latest articles" rail (was duplicating hero/tip).

## Custom content types
- **Books** (`/api/books`, `/api/books/{id}`): 2 seeded titles fall back until WP `book` CPT is registered — `3D Retirement Income` (purple), `Tax Saving Strategies` (gold)
- **Magazines** (`/api/magazines`): returns `[]` until WP `magazine` CPT is registered; Learn tab shows a graceful "coming soon" panel with mockup covers
- **Videos** (`/api/videos?limit=N`): tries WP `video` CPT; falls back to posts with YouTube/Vimeo embeds

## Learn tab — content-first navigation
Replaced the topic grid. New sections: **Bookshelf** (2-col book grid), **Magazines** (grid or coming-soon), **Videos** (2-col grid with play badge). Section switch is a pill-chip row with live counts.

## Tools tab
Three live calculators only: Compound Interest, Social Security Taxability, Mortgage. (RMD Estimator and Roth Conversion Planner removed per user.)

## Lead generation
- Every Google sign-in stores email + name + picture + retirement stage.
- Admin export: `GET /api/admin/leads` (JSON), `/api/admin/leads.csv` (CSV) gated by `X-Admin-Key`.
- Optional webhook: `LEADS_WEBHOOK_URL`.
- Advisor CTA renamed to **"Book a discovery meeting"** → `https://calendly.com/flinde/discovery` (configurable via `CALENDLY_URL` in `/app/frontend/src/theme.ts`).

## Design system (Apple 2026 look)
Warm cream + gold + deep purple. Radius sm 12 · md 20 · lg 28 · xl 36. Floating pill tab bar with gold-tinted glass. Body 17pt, headline 30pt, letter-spacing -0.6.

## Offline layer
`src/offline/cache.ts` (JSON KV + staleWhileRevalidate), `progress.ts` (per-post scroll progress → Continue Reading rail), `downloads.ts` (expo-file-system registry).

## Env
- Backend: `MONGO_URL`, `DB_NAME`, `ADMIN_API_KEY`, `LEADS_WEBHOOK_URL`
- Frontend: `EXPO_PUBLIC_BACKEND_URL`
- Calendly URL configurable in `/app/frontend/src/theme.ts`

## Phase 2 backlog
- Native interactive calculators (Compound Interest / SS taxability / Mortgage in-app)
- Full book reader once WP `book` CPT is populated
- Magazine flipbook once WP `magazine` CPT is populated
- Push notifications (Emergent-managed)
- AI retirement coach (Claude via Emergent key)
- Flowchart pinch-zoom viewer
- Advisor directory, workshop registration
