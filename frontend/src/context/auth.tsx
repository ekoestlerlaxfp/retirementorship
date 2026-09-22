import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore, User } from "../api/client";
import { cache } from "../offline/cache";
import { downloads } from "../offline/downloads";

/** Cache keys whose payload changes based on whether the caller is signed
 * in (books/magazines return preview vs. full member content). Cleared on
 * every sign-in and sign-out so the next fetch reflects the new state. */
const MEMBER_CACHE_KEYS = ["books", "magazines"];

async function purgeMemberCaches() {
  try {
    // Direct list keys
    for (const k of MEMBER_CACHE_KEYS) await cache.remove(k);
    // Individual book/magazine detail entries (`book:<id>`)
    const keys = await cache.keys();
    for (const k of keys) {
      if (k.startsWith("book:")) await cache.remove(k);
    }
  } catch {}
}

type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  retirement_stage?: string | null;
};

type AuthContextT = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  verify: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthContextT | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await tokenStore.get();
    if (!token) { setUser(null); return; }
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      await tokenStore.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [refresh]);

  const applySession = useCallback(async (token: string, u: User) => {
    await tokenStore.set(token);
    // Any cached preview data was fetched anonymously — drop it so the
    // next request comes back with member-only fields (pdf_url, content).
    await purgeMemberCaches();
    setUser(u);
    try {
      const mod = await import("../offline/book-progress");
      await mod.bookProgress.pushDirty();
      await mod.bookProgress.syncFromServer();
    } catch {}
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email.trim(), password);
    await applySession(res.session_token, res.user);
  }, [applySession]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await api.register({
      ...payload,
      email: payload.email.trim(),
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      phone: payload.phone.trim(),
    });
    if (res.session_token && res.user) {
      await applySession(res.session_token, res.user);
    }
  }, [applySession]);

  const verify = useCallback(async (email: string, code: string) => {
    const res = await api.verify(email.trim(), code.trim());
    await applySession(res.session_token, res.user);
  }, [applySession]);

  const resendCode = useCallback(async (email: string) => {
    await api.resendCode(email.trim());
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api.forgotPassword(email.trim());
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, password: string) => {
    const res = await api.resetPassword(email.trim(), code.trim(), password);
    await applySession(res.session_token, res.user);
  }, [applySession]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    await tokenStore.clear();
    // Immediately re-lock: drop cached member payloads and wipe any
    // downloaded member PDFs so the local file can't bypass the gate.
    await purgeMemberCaches();
    try { await downloads.clearByKinds(["book", "magazine"]); } catch {}
    setUser(null);
  }, []);

  const value = useMemo<AuthContextT>(
    () => ({ user, loading, signIn, signOut, register, verify, resendCode, forgotPassword, resetPassword, refresh, setUser }),
    [user, loading, signIn, signOut, register, verify, resendCode, forgotPassword, resetPassword, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
