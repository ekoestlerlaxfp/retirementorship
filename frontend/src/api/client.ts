import * as SecureStore from "expo-secure-store";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "rm_session_token";

export type WPPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  date: string;
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
  tip: WPPost | null;
  stage?: string | null;
};

export type CategoryT = { id: number; name: string; slug: string; count: number };

export type User = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  retirement_stage?: string | null;
};

export const tokenStore = {
  async get() {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(t: string) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, t);
    } catch {}
  },
  async clear() {
    try {
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
  // Auth
  authSession: (session_id: string) =>
    req<{ session_token: string; user: User }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ session_id }),
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
  homeFeed: (stage?: string | null) =>
    req<HomeFeed>(`/wp/home-feed${stage ? `?stage=${stage}` : ""}`),

  // User
  onboarding: (retirement_stage: string) =>
    req<{ user: User }>("/user/onboarding", {
      method: "POST",
      body: JSON.stringify({ retirement_stage }),
    }),
  bookmarks: () => req<any[]>("/user/bookmarks"),
  bookmarkIds: () => req<number[]>("/user/bookmarks/ids"),
  addBookmark: (b: { post_id: number; title: string; image?: string; category?: string; type?: string }) =>
    req("/user/bookmarks", { method: "POST", body: JSON.stringify(b) }),
  removeBookmark: (post_id: number) => req(`/user/bookmarks/${post_id}`, { method: "DELETE" }),
  history: () => req<any[]>("/user/history"),
  addHistory: (h: { post_id: number; title: string; image?: string; category?: string; type?: string; progress?: number }) =>
    req("/user/history", { method: "POST", body: JSON.stringify(h) }),
};
