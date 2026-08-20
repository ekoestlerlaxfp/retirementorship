// RetireMentorship — book reading progress (page-based) with server sync.
// Local-first: writes hit AsyncStorage immediately. When the app has network + a signed-in
// user token, entries with `dirty: true` are pushed to /api/user/book-progress.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokenStore } from "../api/client";

const KEY = "rm.book_progress.v1";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type BookProgress = {
  book_id: string;
  page: number;
  total_pages: number;
  updated_at_ms: number;
  dirty?: boolean; // needs server sync
};

type Store = Record<string, BookProgress>;

async function load(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

async function save(store: Store) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}

async function serverPost(entry: BookProgress): Promise<boolean> {
  const token = await tokenStore.get();
  if (!token) return false;
  try {
    const res = await fetch(`${BASE}/api/user/book-progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        book_id: entry.book_id,
        page: entry.page,
        total_pages: entry.total_pages,
        updated_at: entry.updated_at_ms,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function serverList(): Promise<BookProgress[]> {
  const token = await tokenStore.get();
  if (!token) return [];
  try {
    const res = await fetch(`${BASE}/api/user/book-progress`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as any[];
    return raw.map((r) => ({
      book_id: r.book_id,
      page: r.page || 0,
      total_pages: r.total_pages || 0,
      updated_at_ms: r.updated_at_ms || 0,
    }));
  } catch {
    return [];
  }
}

export const bookProgress = {
  async get(book_id: string): Promise<BookProgress | null> {
    const store = await load();
    return store[book_id] || null;
  },

  async list(): Promise<BookProgress[]> {
    const store = await load();
    return Object.values(store).sort((a, b) => b.updated_at_ms - a.updated_at_ms);
  },

  async set(entry: Omit<BookProgress, "updated_at_ms" | "dirty"> & { updated_at_ms?: number }): Promise<BookProgress> {
    const store = await load();
    const prev = store[entry.book_id];
    // Never regress the page unless total pages resets
    const nextPage = Math.max(prev?.page ?? 0, Math.max(1, entry.page));
    const next: BookProgress = {
      book_id: entry.book_id,
      page: nextPage,
      total_pages: Math.max(prev?.total_pages ?? 0, entry.total_pages || 0),
      updated_at_ms: entry.updated_at_ms ?? Date.now(),
      dirty: true,
    };
    store[entry.book_id] = next;
    await save(store);
    // Fire-and-forget sync
    serverPost(next).then((ok) => {
      if (ok) {
        load().then((s) => {
          if (s[entry.book_id]) {
            s[entry.book_id] = { ...s[entry.book_id], dirty: false };
            save(s);
          }
        });
      }
    });
    return next;
  },

  /** Pull any newer server entries into the local store. */
  async syncFromServer(): Promise<void> {
    const remote = await serverList();
    if (!remote.length) return;
    const store = await load();
    let changed = false;
    for (const r of remote) {
      const cur = store[r.book_id];
      if (!cur || r.updated_at_ms > cur.updated_at_ms) {
        store[r.book_id] = { ...r, dirty: false };
        changed = true;
      }
    }
    if (changed) await save(store);
  },

  /** Push any dirty local entries to the server (call on login / on foreground). */
  async pushDirty(): Promise<void> {
    const store = await load();
    const dirty = Object.values(store).filter((e) => e.dirty);
    if (!dirty.length) return;
    for (const d of dirty) {
      const ok = await serverPost(d);
      if (ok) {
        const cur = await load();
        if (cur[d.book_id]) {
          cur[d.book_id] = { ...cur[d.book_id], dirty: false };
          await save(cur);
        }
      }
    }
  },
};
