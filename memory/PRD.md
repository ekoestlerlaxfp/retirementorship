# RetireMentorship — Product Requirements & Build Notes

## Vision
The #1 retirement education mobile app. Not a financial planner app — an elegant, calming, MasterClass-quality learning platform for people 50–75. Educates first, generates qualified leads second (via a non-intrusive "Talk to an advisor" Calendly CTA).

## Phase 1 (MVP) — Delivered
### User flows
1. Guest onboarding → pick retirement stage (10+, 5–10, 0–5, Retired) or skip → Home
2. Home → hero, tip-of-day, latest articles rail, videos rail, trending rail, advisor CTA, recommended rail
3. Learn → 3 featured category tiles + grid of all topics from WordPress
4. Category detail → 2-column grid of articles
5. Article reader → hero image OR embedded YouTube, big title, meta, HTML body, bookmark/share, advisor CTA
6. Global search → debounced full-text over WordPress
7. Tools → Compound Interest, Social Security Taxability, Mortgage (WP-hosted, open externally). RMD & Roth = "Soon"
8. Library → Tabs Bookmarks / History; guest state prompts sign-in
9. Profile → Avatar, name, stage badge; Google sign-in; advisor CTA

### Tech
- **Backend**: FastAPI + Motor + httpx proxy over `retirementorship.com/wp-json/wp/v2/*` with 15-min in-memory cache, 429 backoff + stale fallback. Emergent Google Auth `/api/auth/*`. User endpoints for onboarding, bookmarks, history.
- **Frontend**: Expo SDK 54 + expo-router. `react-native-render-html` for articles, `react-native-webview` for YouTube, `expo-secure-store` for token, `SafeAreaProvider` everywhere.
- **Design**: Warm cream `#FAF8F5`, gold `#C5A059`, deep purple `#4B3166` for CTAs. 17pt base, 48pt touch targets.

### Env
- Backend: `MONGO_URL`, `DB_NAME`
- Frontend: `EXPO_PUBLIC_BACKEND_URL`
- Calendly URL configurable in `/app/frontend/src/theme.ts`

## Phase 2 (backlog)
- Native interactive calculators (RMD, Roth, Retirement Income)
- Books, magazines, podcasts (needs WP custom post types)
- Downloads / offline reading
- Continue-Reading progress powered by scroll position
- Push notifications (Emergent-managed)
- AI retirement assistant (Claude via Emergent key)
- Community discussions, advisor directory, workshop registration

## Known caveats
- WordPress site rate-limits aggressively; 15-min cache + stale-fallback handles it.
- "Video" detection: any post embedding YouTube/Vimeo shows in videos rail — until WP custom post types exist for real books/magazines/podcasts.
