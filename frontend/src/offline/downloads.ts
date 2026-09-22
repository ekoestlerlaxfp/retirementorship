// RetireMentorship — offline download manager for binaries (PDFs, magazine covers, flowchart images).
// Uses expo-file-system to persist files under `documents/rm-downloads/<kind>/<id>.<ext>`.
// A metadata registry in AsyncStorage tracks each download's status, size, version, local URI, kind.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const REG_KEY = "rm.downloads.v1";
const DIR = (FileSystem.documentDirectory || FileSystem.cacheDirectory || "") + "rm-downloads/";

export type DownloadKind = "article" | "book" | "magazine" | "flowchart" | "pdf" | "image";
export type DownloadStatus = "queued" | "downloading" | "ready" | "error";

export type DownloadItem = {
  id: string;           // stable id, e.g. "magazine-42" or "article-15919"
  kind: DownloadKind;
  post_id?: number;
  title: string;
  cover?: string | null;
  remote_url: string;   // origin URL of the binary
  headers?: Record<string, string>; // optional auth headers for protected URLs
  local_uri?: string;   // file:// path once downloaded
  bytes: number;        // size in bytes (0 until ready)
  status: DownloadStatus;
  progress: number;     // 0..1
  version?: string | null; // e.g. WP modified timestamp
  saved_at: number;     // epoch ms
  error?: string;
};

type Registry = Record<string, DownloadItem>;

async function loadReg(): Promise<Registry> {
  try {
    const raw = await AsyncStorage.getItem(REG_KEY);
    return raw ? (JSON.parse(raw) as Registry) : {};
  } catch { return {}; }
}
async function saveReg(reg: Registry) {
  try { await AsyncStorage.setItem(REG_KEY, JSON.stringify(reg)); } catch {}
}

async function ensureDir() {
  if (Platform.OS === "web") return;
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  } catch {}
}

function guessExt(url: string, fallback = "bin") {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return (m ? m[1] : fallback).toLowerCase();
}

const listeners = new Set<(reg: Registry) => void>();
function notify(reg: Registry) { listeners.forEach((l) => l(reg)); }

export const downloads = {
  subscribe(fn: (reg: Registry) => void) {
    listeners.add(fn);
    // fire once with current state
    loadReg().then((r) => fn(r));
    return () => listeners.delete(fn);
  },

  async list(): Promise<DownloadItem[]> {
    const reg = await loadReg();
    return Object.values(reg).sort((a, b) => b.saved_at - a.saved_at);
  },

  async get(id: string): Promise<DownloadItem | null> {
    const reg = await loadReg();
    return reg[id] || null;
  },

  async start(
    input: Omit<DownloadItem, "bytes" | "status" | "progress" | "saved_at" | "local_uri" | "error">
  ): Promise<DownloadItem> {
    if (Platform.OS === "web") {
      // On web, we cannot persist a binary to a device path — just mark as ready pointing at remote.
      const reg = await loadReg();
      const item: DownloadItem = {
        ...input,
        bytes: 0,
        status: "ready",
        progress: 1,
        saved_at: Date.now(),
        local_uri: input.remote_url,
      };
      reg[input.id] = item;
      await saveReg(reg);
      notify(reg);
      return item;
    }

    await ensureDir();
    const reg = await loadReg();
    const ext = guessExt(input.remote_url, input.kind === "pdf" ? "pdf" : "bin");
    const target = DIR + input.id + "." + ext;

    // Seed registry entry as queued
    const seed: DownloadItem = {
      ...input,
      bytes: 0,
      status: "downloading",
      progress: 0,
      saved_at: Date.now(),
    };
    reg[input.id] = seed;
    await saveReg(reg);
    notify(reg);

    try {
      const resumable = FileSystem.createDownloadResumable(
        input.remote_url,
        target,
        input.headers ? { headers: input.headers } : {},
        async (p) => {
          const total = p.totalBytesExpectedToWrite || 0;
          const wrote = p.totalBytesWritten || 0;
          const cur = await loadReg();
          const it = cur[input.id];
          if (!it) return;
          it.progress = total > 0 ? wrote / total : 0;
          it.bytes = wrote;
          cur[input.id] = it;
          await saveReg(cur);
          notify(cur);
        }
      );
      const res = await resumable.downloadAsync();
      if (!res) throw new Error("download returned no result");
      const info = await FileSystem.getInfoAsync(res.uri);
      const finalReg = await loadReg();
      finalReg[input.id] = {
        ...finalReg[input.id],
        local_uri: res.uri,
        bytes: (info as any).size || 0,
        status: "ready",
        progress: 1,
        saved_at: Date.now(),
      };
      await saveReg(finalReg);
      notify(finalReg);
      return finalReg[input.id];
    } catch (e: any) {
      const errReg = await loadReg();
      errReg[input.id] = {
        ...errReg[input.id],
        status: "error",
        error: String(e?.message || e),
      };
      await saveReg(errReg);
      notify(errReg);
      return errReg[input.id];
    }
  },

  async remove(id: string): Promise<void> {
    const reg = await loadReg();
    const item = reg[id];
    if (!item) return;
    if (Platform.OS !== "web" && item.local_uri && item.local_uri.startsWith("file://")) {
      try { await FileSystem.deleteAsync(item.local_uri, { idempotent: true }); } catch {}
    }
    delete reg[id];
    await saveReg(reg);
    notify(reg);
  },

  async totalBytes(): Promise<number> {
    const items = await downloads.list();
    return items.reduce((sum, it) => sum + (it.bytes || 0), 0);
  },

  async clearAll(): Promise<void> {
    const items = await downloads.list();
    for (const it of items) await downloads.remove(it.id);
  },

  /** Remove all downloads for the given kinds. Used on sign-out to
   * purge member-only content (books, magazines) from the device so a
   * signed-out user cannot bypass the reader gate via a local file. */
  async clearByKinds(kinds: DownloadKind[]): Promise<void> {
    const items = await downloads.list();
    const set = new Set<DownloadKind>(kinds);
    for (const it of items) {
      if (set.has(it.kind)) await downloads.remove(it.id);
    }
  },
};

export function formatBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
