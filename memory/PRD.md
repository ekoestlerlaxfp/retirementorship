# RetireMentorship — Product Requirements & Build Notes

## Vision
The #1 retirement education mobile app. Not a financial planner app — an elegant, calming, MasterClass-quality learning platform for people 50–75. Educates first, generates qualified leads second (via a non-intrusive "Talk to an advisor" Calendly CTA).

Tagline: **"Retire Successfully. Stay Successfully Retired."**

## Phase 1 (MVP) — Delivered
### User flows
1. Guest onboarding → pick retirement stage → Home
2. Home → hero, tip-of-day, **continue reading**, latest articles rail, videos rail, trending rail, advisor CTA, recommended rail
3. Learn → featured category tiles + grid of all WP topics
4. Category detail → 2-column article grid
5. Article reader → hero/video, big title, meta, HTML body, **bookmark**, **share**, **save-for-offline** (cloud icon), advisor CTA. **Reading progress auto-tracked on scroll.**
6. Global search → debounced WP search (with empty-retry)
7. Tools → Compound Interest, Social Security Taxability, Mortgage (open in browser). RMD & Roth = "Soon"
8. Library → Tabs Bookmarks / History; guest state prompts sign-in
9. Profile → Avatar, name, stage badge; Google sign-in; **Downloads & storage** row; advisor CTA
10. **Downloads & storage** screen — cached-items count, offline-download registry, reading-progress count, per-item delete + clear-cache

### Offline system (this iteration)
- **`src/offline/cache.ts`** — namespaced JSON KV cache with schema version, saved-at ms, and content version tag. Ships `staleWhileRevalidate(key, fetcher, { onCache, onFresh })`.
- **`src/offline/progress.ts`** — per-post reading progress (0–1), throttled writes on scroll, powers "Continue reading" rail.
- **`src/offline/downloads.ts`** — expo-file-system download manager. Persists PDFs / images to `documents/rm-downloads/`, tracks status, progress, bytes, version. Web falls back to registry-only.
- **`cachedApi.homeFeed / categories / post / category`** — cache-first + background refresh. Every screen now paints instantly from cache when available, then updates.
- **Version tracking**: backend now exposes `modified` on every WP post so future logic can compare and refresh selectively.

### Tech
- **Backend**: FastAPI + Motor + httpx proxy over `retirementorship.com/wp-json/wp/v2/*` with 15-min in-memory cache + stale fallback + empty-search retry. Emergent Google Auth. User endpoints for onboarding, bookmarks, history.
- **Frontend**: Expo SDK 54 + expo-router. `react-native-render-html`, `react-native-webview`, `expo-file-system`, `expo-image`, `expo-secure-store`. `SafeAreaProvider` everywhere.
- **Design**: Warm cream `#FAF8F5`, gold `#C5A059`, deep purple `#4B3166` for CTAs. 17pt base, 48pt touch targets. Gold RM monogram logo in onboarding hero, home header, profile footer.

### Env
- Backend: `MONGO_URL`, `DB_NAME`
- Frontend: `EXPO_PUBLIC_BACKEND_URL`
- Calendly URL configurable in `/app/frontend/src/theme.ts` (`CALENDLY_URL`)
- Brand assets in `BRAND` constant in same file

## Phase 2 (backlog)
- Native interactive calculators (RMD, Roth, Retirement Income)
- Books, magazines, podcasts (needs WP custom post types — download system is already ready)
- Flowchart pinch-zoom viewer
- Push notifications (Emergent-managed)
- AI retirement coach (Claude via Emergent key) — answers from published content only
- Advisor directory, workshop registration
