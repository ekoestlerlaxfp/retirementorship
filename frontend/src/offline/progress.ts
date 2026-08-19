// RetireMentorship — reading progress tracker.
// Stores per-post_id: { progress: 0..1, updated_at: ms, title, image, category, type }.
// Purely local; the backend also stores history/progress for signed-in users.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rm.progress.v1";

export type ProgressEntry = {
  post_id: number;
  progress: number;   // 0..1
  updated_at: number; // epoch ms
  title: string;
  image?: string | null;
  category?: string | null;
  type?: "article" | "video";
};

type Store = Record<string, ProgressEntry>;

async function load(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

async function save(store: Store): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}

export const progress = {
  async get(post_id: number): Promise<ProgressEntry | null> {
    const store = await load();
    return store[String(post_id)] || null;
  },

  async set(entry: Omit<ProgressEntry, "updated_at">): Promise<void> {
    const store = await load();
    const prev = store[String(entry.post_id)];
    const nextP = Math.max(prev?.progress ?? 0, Math.min(1, Math.max(0, entry.progress)));
    store[String(entry.post_id)] = { ...entry, progress: nextP, updated_at: Date.now() };
    await save(store);
  },

  async list(): Promise<ProgressEntry[]> {
    const store = await load();
    return Object.values(store).sort((a, b) => b.updated_at - a.updated_at);
  },

  async recent(limit = 6): Promise<ProgressEntry[]> {
    const all = await progress.list();
    return all.filter((p) => p.progress > 0.02 && p.progress < 0.95).slice(0, limit);
  },

  async clear(): Promise<void> {
    try { await AsyncStorage.removeItem(KEY); } catch {}
  },
};
