import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "rm_session_token";

export type WPPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  date: string;
  modified?: string;
  link: string;
  image?: string;
  image_alt?: string;
  category?: { id: number; name: string; slug: string } | null;
  author?: { name?: string; avatar?: string } | null;
  reading_time: number;
  type: "article" | "video";
};

export type HomeFeed = {
  hero: WPPost | null;
  featured: WPPost[];
  latest: WPPost[];
  videos: WPPost[];
  trending: WPPost[];
  recommended: WPPost[];
  tip: WPPost | null;
  stage?: string | null;
};

export type CategoryT = { id: number; name: string; slug: string; count: number };

export type BookT = {
  id: string | number;
  slug: string;
  title: string;
  subtitle?: string;
  author?: string;
  excerpt?: string;
  content_html?: string;
  image?: string | null;
  hero_image?: string | null;
  cover_gradient?: string[];
  accent?: string;
  chapters?: number;
  reading_time?: number;
  type: "book";
  pdf_url?: string;
  modified?: string;
};

export type MagazineT = {
  id: string | number;
  slug: string;
  title: string;
  subtitle?: string;
  issue_label?: string;
  cover_gradient?: string[];
  accent?: string;
  excerpt?: string;
  image?: string | null;
  content_html?: string;
  pdf_url?: string;
  date?: string;
  type: "magazine";
};

export type User = {
  user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  verified?: boolean;
  retirement_stage?: string | null;
  // Legacy shim so existing components using `name`/`picture` still work.
  name?: string;
  picture?: string | null;
};

export const tokenStore = {
  async get() {
    try {
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        return localStorage.getItem(TOKEN_KEY);
      }
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(t: string) {
    try {
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        localStorage.setItem(TOKEN_KEY, t);
        return;
      }
      await SecureStore.setItemAsync(TOKEN_KEY, t);
    } catch {}
  },
  async clear() {
    try {
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
        return;
      }
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  },
};

async function req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenStore.get();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) await tokenStore.clear();
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as any;
}

export const api = {
  // Auth — custom email/password with email verification
  register: (payload: {
    first_name: string; last_name: string; email: string; phone: string; password: string;
    retirement_stage?: string | null;
  }) => req<{ user: User; session_token?: string }>("/auth/register", {
    method: "POST", body: JSON.stringify(payload),
  }),
  verify: (email: string, code: string) =>
    req<{ session_token: string; user: User }>("/auth/verify", {
      method: "POST", body: JSON.stringify({ email, code }),
    }),
  resendCode: (email: string) =>
    req<{ ok: boolean }>("/auth/resend-code", {
      method: "POST", body: JSON.stringify({ email }),
    }),
  login: (email: string, password: string) =>
    req<{ session_token: string; user: User }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),
  forgotPassword: (email: string) =>
    req<{ ok: boolean }>("/auth/forgot-password", {
      method: "POST", body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, code: string, password: string) =>
    req<{ session_token: string; user: User }>("/auth/reset-password", {
      method: "POST", body: JSON.stringify({ email, code, password }),
    }),
  me: () => req<{ user: User }>("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),

  // WP
  categories: () => req<CategoryT[]>("/wp/categories"),
  posts: (params: { page?: number; per_page?: number; category?: number; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.per_page) q.set("per_page", String(params.per_page));
    if (params.category) q.set("category", String(params.category));
    if (params.search) q.set("search", params.search);
    return req<WPPost[]>(`/wp/posts?${q.toString()}`);
  },
  post: (id: number) => req<WPPost>(`/wp/posts/${id}`),
  homeFeed: (params: { stage?: string | null; exclude_ids?: string; interest_cat?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.stage) q.set("stage", params.stage);
    if (params.exclude_ids) q.set("exclude_ids", params.exclude_ids);
    if (params.interest_cat) q.set("interest_cat", String(params.interest_cat));
    const qs = q.toString();
    return req<HomeFeed>(`/wp/home-feed${qs ? `?${qs}` : ""}`);
  },

  // User
  onboarding: (retirement_stage: string) =>
    req<{ user: User }>("/user/onboarding", {
      method: "POST",
      body: JSON.stringify({ retirement_stage }),
    }),
  bookmarks: () => req<any[]>("/user/bookmarks"),
  bookmarkIds: () => req<string[]>("/user/bookmarks/ids"),
  addBookmark: (b: { post_id: string; title: string; image?: string | null; category?: string | null; type?: string }) =>
    req("/user/bookmarks", { method: "POST", body: JSON.stringify(b) }),
  removeBookmark: (post_id: string) => req(`/user/bookmarks/${encodeURIComponent(post_id)}`, { method: "DELETE" }),
  history: () => req<any[]>("/user/history"),
  addHistory: (h: { post_id: string; title: string; image?: string | null; category?: string | null; type?: string; progress?: number }) =>
    req("/user/history", { method: "POST", body: JSON.stringify(h) }),
  completedIds: () => req<string[]>("/user/completed/ids"),
  sendFeedback: (question: string) =>
    req<{ ok: boolean }>("/user/feedback", { method: "POST", body: JSON.stringify({ question }) }),

  // Content types
  books: () => req<BookT[]>("/books"),
  book: (id: string | number) => req<BookT>(`/books/${id}`),
  magazines: () => req<MagazineT[]>("/magazines"),
  videos: (limit = 12) => req<WPPost[]>(`/videos?limit=${limit}`),
};

// -------- Cached wrappers (cache-first + background revalidate) --------
import { cache } from "../offline/cache";

const K = {
  homeFeed: (stage?: string | null) => `home-feed:${stage || "any"}`,
  categories: () => "categories",
  post: (id: number) => `post:${id}`,
  category: (id: number) => `category:${id}`,
  books: () => "books",
  book: (id: string | number) => `book:${id}`,
  magazines: () => "magazines",
  videos: () => "videos",
};

export const cachedApi = {
  homeFeed(
    stage: string | null | undefined,
    handlers: {
      onCache?: (data: HomeFeed | null, savedAt: number | null) => void;
      onFresh?: (data: HomeFeed) => void;
      onError?: (e: unknown) => void;
    } = {},
    opts: { exclude_ids?: string; interest_cat?: number } = {}
  ) {
    const keySuffix = `${opts.exclude_ids ? `:x=${opts.exclude_ids.slice(0, 40)}` : ""}${opts.interest_cat ? `:c=${opts.interest_cat}` : ""}`;
    return cache.staleWhileRevalidate<HomeFeed>(
      K.homeFeed(stage) + keySuffix,
      () => api.homeFeed({ stage, exclude_ids: opts.exclude_ids, interest_cat: opts.interest_cat }),
      handlers
    );
  },
  categories(handlers: { onCache?: (d: CategoryT[] | null) => void; onFresh?: (d: CategoryT[]) => void } = {}) {
    return cache.staleWhileRevalidate<CategoryT[]>(K.categories(), () => api.categories(), {
      onCache: (d) => handlers.onCache?.(d),
      onFresh: (d) => handlers.onFresh?.(d),
    });
  },
  post(
    id: number,
    handlers: {
      onCache?: (data: WPPost | null, savedAt: number | null) => void;
      onFresh?: (data: WPPost) => void;
      onError?: (e: unknown) => void;
    } = {}
  ) {
    return cache.staleWhileRevalidate<WPPost>(
      K.post(id),
      () => api.post(id),
      {
        ...handlers,
        onFresh: (fresh) => {
          handlers.onFresh?.(fresh);
          // Compare versions and note if content changed
          // (consumer already sees new content via onFresh)
        },
      }
    );
  },
  category(
    id: number,
    handlers: {
      onCache?: (data: WPPost[] | null) => void;
      onFresh?: (data: WPPost[]) => void;
    } = {}
  ) {
    return cache.staleWhileRevalidate<WPPost[]>(
      K.category(id),
      () => api.posts({ category: id, per_page: 20 }),
      handlers
    );
  },
  books(handlers: { onCache?: (d: BookT[] | null) => void; onFresh?: (d: BookT[]) => void } = {}) {
    return cache.staleWhileRevalidate<BookT[]>(K.books(), () => api.books(), handlers);
  },
  book(
    id: string | number,
    handlers: { onCache?: (d: BookT | null) => void; onFresh?: (d: BookT) => void } = {}
  ) {
    return cache.staleWhileRevalidate<BookT>(K.book(id), () => api.book(id), handlers);
  },
  magazines(handlers: { onCache?: (d: MagazineT[] | null) => void; onFresh?: (d: MagazineT[]) => void } = {}) {
    return cache.staleWhileRevalidate<MagazineT[]>(K.magazines(), () => api.magazines(), handlers);
  },
  videos(handlers: { onCache?: (d: WPPost[] | null) => void; onFresh?: (d: WPPost[]) => void } = {}) {
    return cache.staleWhileRevalidate<WPPost[]>(K.videos(), () => api.videos(20), handlers);
  },
};

export const cacheKeys = K;
