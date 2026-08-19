import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { H1, Muted, EmptyState, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";

type Tab = "bookmarks" | "history";

export default function Library() {
  const { user, signIn } = useAuth();
  const [tab, setTab] = useState<Tab>("bookmarks");
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setItems([]); return; }
    try {
      const data = tab === "bookmarks" ? await api.bookmarks() : await api.history();
      setItems(data);
    } catch {
      setItems([]);
    } finally { setRefreshing(false); }
  }, [tab, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>YOUR SHELF</Text>
          <H1 style={{ marginTop: 4 }}>Library</H1>
          <Muted style={{ marginTop: spacing.sm }}>Saved articles, videos, and reading history.</Muted>
        </View>
        <View style={styles.tabs}>
          {(["bookmarks", "history"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              testID={`library-tab-${t}`}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "bookmarks" ? "Bookmarks" : "History"}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {!user ? (
        <View style={styles.signInWrap}>
          <View style={styles.signInIcon}>
            <Ionicons name="heart" size={32} color={colors.brandPrimary} />
          </View>
          <Text style={styles.signInTitle}>Save what matters to you</Text>
          <Muted style={{ textAlign: "center", marginBottom: spacing.xl, maxWidth: 300 }}>
            Sign in to bookmark articles, track reading progress, and pick up where you left off.
          </Muted>
          <View style={{ width: "100%", maxWidth: 320 }}>
            <PrimaryButton testID="library-signin" label="Sign in with Google" onPress={signIn} icon="logo-google" />
          </View>
        </View>
      ) : items === null ? null : items.length === 0 ? (
        <EmptyState
          testID="library-empty"
          icon={tab === "bookmarks" ? "bookmark-outline" : "time-outline"}
          title={tab === "bookmarks" ? "No bookmarks yet" : "No reading history yet"}
          subtitle={tab === "bookmarks" ? "Tap the bookmark icon on any article to save it here." : "Start reading to build your history."}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
        >
          {items.map((it) => (
            <Pressable
              key={it.post_id}
              testID={`library-item-${it.post_id}`}
              onPress={() => router.push({ pathname: "/article/[id]", params: { id: String(it.post_id) } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
            >
              <Image source={{ uri: it.image }} style={styles.rowImg} contentFit="cover" transition={200} />
              <View style={{ flex: 1 }}>
                {it.category && <Text style={styles.rowCat}>{String(it.category).toUpperCase()}</Text>}
                <Text style={styles.rowTitle} numberOfLines={3}>{it.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
  },
  tabActive: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  tabText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: "#FFF" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowImg: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowCat: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 0.8, fontSize: 11, marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, lineHeight: 20 },
  signInWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  signInIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
  signInTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm, textAlign: "center" },
});
