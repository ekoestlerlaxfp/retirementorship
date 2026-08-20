import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { api, tokenStore, User } from "../api/client";

WebBrowser.maybeCompleteAuthSession();

type AuthContextT = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthContextT | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processedSessions = useRef<Set<string>>(new Set());
  const capturedUrl = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await tokenStore.get();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      await tokenStore.clear();
      setUser(null);
    }
  }, []);

  const processCallback = useCallback(async (url: string | null) => {
    if (!url) return false;
    const m = url.match(/[?#&]session_id=([^&#]+)/);
    if (!m) return false;
    const session_id = decodeURIComponent(m[1]);
    if (processedSessions.current.has(session_id)) return true;
    processedSessions.current.add(session_id);
    try {
      const { session_token, user } = await api.authSession(session_id);
      await tokenStore.set(session_token);
      setUser(user);
      return true;
    } catch (e) {
      console.warn("Auth exchange failed", e);
      return false;
    }
  }, []);

  // Cold start + hot deep link handling
  useEffect(() => {
    let mounted = true;
    const sub = Linking.addEventListener("url", (evt) => {
      capturedUrl.current = evt.url;
      processCallback(evt.url);
    });
    (async () => {
      const initial = await Linking.getInitialURL();
      const handled = await processCallback(initial);
      if (!handled) await refresh();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [processCallback, refresh]);

  const signIn = useCallback(async () => {
    const redirectUrl = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    capturedUrl.current = null;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    // Try all three sources
    let url: string | null = null;
    if (result.type === "success" && (result as any).url) url = (result as any).url;
    if (!url) url = capturedUrl.current;
    if (!url) url = await Linking.getInitialURL();
    await processCallback(url);
    // Kick off book-progress sync after login
    try {
      const mod = await import("../offline/book-progress");
      await mod.bookProgress.pushDirty();
      await mod.bookProgress.syncFromServer();
    } catch {}
  }, [processCallback]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    await tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh, setUser }),
    [user, loading, signIn, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
