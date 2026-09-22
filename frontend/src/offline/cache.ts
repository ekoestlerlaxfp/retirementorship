// RetireMentorship — local JSON/metadata cache.
// Keys are namespaced (prefix `rm.cache:`) so purge/list is safe.
// Values are wrapped as: { v: <schemaVersion>, t: <savedAt ms>, ver?: <content version tag>, d: <payload> }.
// Public API is cache.get / cache.set / cache.remove / cache.staleWhileRevalidate.

import AsyncStorage from "@react-native-async-storage/async-storage";

const NS = "rm.cache:";
const SCHEMA_VERSION = 1;

export type CacheEntry<T> = {
  v: number;         // schema version
  t: number;         // saved-at epoch ms
  ver?: string | null; // content version tag (e.g. WP modified timestamp)
  d: T;              // payload
};

async function readRaw(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(NS + key);
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(NS + key, value);
    return true;
  } catch {
    return false;
  }
}

export const cache = {
  async get<T = any>(key: string): Promise<CacheEntry<T> | null> {
    const raw = await readRaw(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed?.v !== SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, data: T, ver?: string | null): Promise<boolean> {
    const entry: CacheEntry<T> = { v: SCHEMA_VERSION, t: Date.now(), ver: ver ?? null, d: data };
    return writeRaw(key, JSON.stringify(entry));
  },

  async remove(key: string): Promise<void> {
    try { await AsyncStorage.removeItem(NS + key); } catch {}
  },

  async keys(): Promise<string[]> {
    try {
      const all = await AsyncStorage.getAllKeys();
      return all.filter((k) => k.startsWith(NS)).map((k) => k.slice(NS.length));
    } catch {
      return [];
    }
  },

  async purgeAll(): Promise<void> {
    try {
      const all = await AsyncStorage.getAllKeys();
      const mine = all.filter((k) => k.startsWith(NS));
      if (mine.length) await AsyncStorage.multiRemove(mine);
    } catch {}
  },

  /**
   * Return cached value immediately (or null) via `onCache`, then fetch fresh in the background.
   * Call `onFresh` when the network responds. Errors during refresh are silent — cached data stays visible.
   * If nothing is cached, `onCache` fires once with null and `onFresh` fires with the network result.
   */
  async staleWhileRevalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    opts: {
      onCache?: (cached: T | null, savedAt: number | null) => void;
      onFresh?: (fresh: T) => void;
      onError?: (err: unknown) => void;
      ver?: string | null;
    } = {}
  ): Promise<T | null> {
    const entry = await cache.get<T>(key);
    if (opts.onCache) opts.onCache(entry ? entry.d : null, entry ? entry.t : null);
    try {
      const fresh = await fetcher();
      // Guard: never overwrite a populated cache with an empty list/object —
      // a transient WP outage would otherwise wipe usable content.
      const looksEmpty =
        (Array.isArray(fresh) && fresh.length === 0) ||
        (fresh && typeof fresh === "object" && !Array.isArray(fresh) && Object.keys(fresh as any).length === 0);
      const hadContent =
        entry &&
        ((Array.isArray(entry.d) && entry.d.length > 0) ||
          (entry.d && typeof entry.d === "object"));
      if (looksEmpty && hadContent) {
        // Keep cached content; just notify caller the network responded.
        if (opts.onFresh) opts.onFresh(entry!.d);
        return entry!.d;
      }
      await cache.set(key, fresh, opts.ver);
      if (opts.onFresh) opts.onFresh(fresh);
      return fresh;
    } catch (e) {
      if (opts.onError) opts.onError(e);
      return entry ? entry.d : null;
    }
  },
};

// Approximate footprint of all cached JSON in bytes (character count).
export async function cacheSize(): Promise<number> {
  const keys = await cache.keys();
  let total = 0;
  for (const k of keys) {
    const raw = await readRaw(k);
    if (raw) total += raw.length;
  }
  return total;
}
