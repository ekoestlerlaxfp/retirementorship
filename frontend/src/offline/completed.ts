// RetireMentorship — local cache of "completed" post_ids.
// - Reads from AsyncStorage on mount so pills paint immediately.
// - Refreshes from the server whenever we know a user is signed in.
// - Provides mark() / unmark() helpers that also POST to /api/user/history.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { useAuth } from "../context/auth";

const KEY = "rm.completed.v1";

async function loadLocal(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

async function saveLocal(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {}
}

/**
 * Global-ish store: a tiny observable set so every mounted card / row
 * updates the moment a user marks something complete anywhere in the app.
 */
type Listener = (ids: Set<string>) => void;

class CompletedStore {
  private set: Set<string> = new Set();
  private listeners = new Set<Listener>();
  private hydrated = false;

  async hydrate() {
    if (this.hydrated) return;
    this.set = await loadLocal();
    this.hydrated = true;
    this.emit();
  }

  get(): Set<string> { return this.set; }

  has(id: string): boolean { return this.set.has(id); }

  async setAll(ids: string[]) {
    this.set = new Set(ids.map(String));
    this.hydrated = true;
    await saveLocal(this.set);
    this.emit();
  }

  async add(id: string) {
    if (this.set.has(id)) return;
    const next = new Set(this.set);
    next.add(id);
    this.set = next;
    await saveLocal(this.set);
    this.emit();
  }

  async remove(id: string) {
    if (!this.set.has(id)) return;
    const next = new Set(this.set);
    next.delete(id);
    this.set = next;
    await saveLocal(this.set);
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.set);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    for (const l of this.listeners) l(this.set);
  }
}

export const completedStore = new CompletedStore();

// Hydrate immediately on module load so guests see cached pills.
completedStore.hydrate().catch(() => {});

export function useCompleted(): {
  set: Set<string>;
  isComplete: (id: string | number) => boolean;
  markComplete: (item: { post_id: string; title: string; image?: string | null; category?: string | null; type?: string }) => Promise<void>;
  unmarkComplete: (post_id: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [set, setSet] = useState<Set<string>>(() => completedStore.get());
  const firstServerSync = useRef(false);

  // Subscribe to the store so every card updates simultaneously.
  useEffect(() => completedStore.subscribe(setSet), []);

  // Pull latest from server once we have a user
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const ids = await api.completedIds();
      await completedStore.setAll(ids || []);
    } catch { /* silent */ }
  }, [user]);

  useEffect(() => {
    if (user && !firstServerSync.current) {
      firstServerSync.current = true;
      refresh();
    }
    if (!user) firstServerSync.current = false;
  }, [user, refresh]);

  const markComplete = useCallback(
    async (item: { post_id: string; title: string; image?: string | null; category?: string | null; type?: string }) => {
      // Optimistic: paint pill immediately
      await completedStore.add(item.post_id);
      if (user) {
        try {
          await api.addHistory({ ...item, progress: 1.0 });
        } catch {
          // rollback on failure — user is signed in but server rejected
          await completedStore.remove(item.post_id);
          throw new Error("Could not save. Please try again.");
        }
      }
    },
    [user]
  );

  const unmarkComplete = useCallback(async (post_id: string) => {
    // Optimistic remove
    await completedStore.remove(post_id);
    if (user) {
      try {
        await api.addHistory({ post_id, title: "", progress: 0.5 });
      } catch { /* keep local state; server will resync on next refresh */ }
    }
  }, [user]);

  const isComplete = useCallback((id: string | number) => set.has(String(id)), [set]);

  return useMemo(() => ({ set, isComplete, markComplete, unmarkComplete, refresh }),
    [set, isComplete, markComplete, unmarkComplete, refresh]);
}
