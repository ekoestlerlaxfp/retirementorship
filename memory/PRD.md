# RetireMentorship — Product Requirements & Build Notes

## Vision
The #1 retirement education mobile app. Not a financial planner app — an elegant, calming, MasterClass-quality learning platform for people 50–75. Educates first, generates qualified leads second (via a non-intrusive "Talk to an advisor" Calendly CTA).

Tagline: **"Retire Successfully. Stay Successfully Retired."**

## Content pipeline — WordPress is the source of truth
- All articles, videos, categories flow from `https://retirementorship.com/wp-json/wp/v2/*`.
- Backend proxies with a 3-min in-memory cache, 429 stale-fallback, empty-search retry.
- `GET /api/wp/latest-modified` gives the newest post's `modified` timestamp for cheap freshness checks.
- Frontend uses **stale-while-revalidate**: instant paint from cache, then background refresh from WordPress on mount **AND** on every AppState `active` event (foreground) — new posts appear without any new app release.

## Lead generation
- Every Google sign-in captures **email + name + picture + user_id + retirement_stage** into MongoDB.
- **Admin export**: `GET /api/admin/leads` (JSON) and `/api/admin/leads.csv` (CSV) gated by `X-Admin-Key` header (see `.env` `ADMIN_API_KEY`).
- **Optional webhook**: set `LEADS_WEBHOOK_URL` in `.env` to fire a POST on every new signup — plug it into Zapier / Make / HubSpot / email.
- Calendly CTA card is placed on Home, Tools, Profile, and the bottom of every article.

## User flows (Phase 1 delivered)
1. Guest onboarding → pick retirement stage → Home
2. Home → floating brand row w/ freshness pill · headline · **large hero (36px rounded)** · Today's Tip · Continue Reading (from local progress) · Latest · Videos · Trending · Advisor CTA · Recommended
3. Learn → featured tiles + grid of WP topics
4. Category → 2-column article grid
5. Article reader → hero/YouTube, big title, meta, rich HTML, bookmark, share, save-for-offline (persists cover via expo-file-system), scroll-driven reading progress, advisor CTA
6. Global search → debounced WP full-text, empty-retry safeguard
7. Tools → 3 live calculators (WordPress-hosted, opened in system browser). RMD & Roth = "Soon"
8. Library → Bookmarks / History tabs; guest state prompts sign-in
9. Profile → Avatar, name, stage badge, Google sign-in, Downloads & storage, advisor CTA
10. Downloads & storage — cached size, downloaded files, reading-progress count, delete + clear-cache

## Design system (updated for Apple 2026 look)
- Palette: warm cream `#FAF8F5`, gold `#C5A059`, deep purple `#4B3166` for CTAs
- Radius scale: **sm 12, md 20, lg 28, xl 36** (chunkier than before)
- Softer, deeper shadows (blur 20–32, low opacity)
- **Floating pill tab bar** (rounded 28) with gold-tinted glass — sits above safe-area with 16pt inset
- Base body 17pt, headline 30pt, hero 32pt — richer letter-spacing (-0.6 on displays)
- Cards get 0.5px inner ring + light shadow for premium depth
- Gold RM monogram logo in onboarding hero, home header, profile footer

## Offline / caching (from prior iteration, still active)
- `src/offline/cache.ts` — namespaced JSON KV cache, `staleWhileRevalidate`
- `src/offline/progress.ts` — per-post scroll progress → Continue Reading rail
- `src/offline/downloads.ts` — expo-file-system binary downloads registry (ready for books/magazines/PDFs)

## Env
- Backend: `MONGO_URL`, `DB_NAME`, `ADMIN_API_KEY`, `LEADS_WEBHOOK_URL`
- Frontend: `EXPO_PUBLIC_BACKEND_URL`
- Calendly URL configurable in `/app/frontend/src/theme.ts` (`CALENDLY_URL`)
- Brand assets in `BRAND` constant in same file

## Phase 2 backlog
- Native interactive calculators (RMD, Roth, Retirement Income)
- Books, magazines, podcasts (needs WP custom post types — download system is ready)
- Flowchart pinch-zoom viewer
- Push notifications (Emergent-managed)
- AI retirement coach (Claude via Emergent key)
- Advisor directory, workshop registration
