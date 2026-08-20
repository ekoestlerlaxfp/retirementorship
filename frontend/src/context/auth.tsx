import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore, User } from "../api/client";

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
  register: (payload: RegisterPayload) => Promise<{ verification_required: boolean; email_sent: boolean; email_error: string | null }>;
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
    return {
      verification_required: !!res.verification_required,
      email_sent: res.email_sent !== false,
      email_error: res.email_error || null,
    };
  }, []);

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
