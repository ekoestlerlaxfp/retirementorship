import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { api, cachedApi, WPPost } from "@/src/api/client";
import { ArticleCard } from "@/src/components/cards";
import { CenteredLoader, EmptyState } from "@/src/components/ui";

const PER_PAGE = 20;

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string; slug: string }>();
  const [posts, setPosts] = useState<WPPost[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial load: cache-first, then a fresh page-1 request that tells us if more exist.
  useEffect(() => {
    if (!id) return;
    cachedApi.category(Number(id), {
      onCache: (d) => { if (d) setPosts(d); },
      onFresh: (d) => { setPosts(d); setPage(1); setHasMore(d.length >= PER_PAGE); },
    }).then((d) => { if (d && !posts) setPosts(d); }).catch(() => setPosts([]));
    // Fresh network fetch with our chosen page size so hasMore is reliable.
    api.posts({ category: Number(id), per_page: PER_PAGE, page: 1 })
      .then((d) => {
        setPosts(d);
        setPage(1);
        setHasMore((d?.length || 0) >= PER_PAGE);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadMore = useCallback(async () => {
    if (!id || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const more = await api.posts({ category: Number(id), per_page: PER_PAGE, page: next });
      setPosts((cur) => {
        const existing = cur || [];
        const seen = new Set(existing.map((p) => p.id));
        return [...existing, ...(more || []).filter((p) => !seen.has(p.id))];
      });
      setPage(next);
      setHasMore((more?.length || 0) >= PER_PAGE);
    } catch {
      // keep hasMore so the user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [id, page, hasMore, loadingMore]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="cat-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>TOPIC</Text>
            <Text style={styles.title}>{name}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!posts ? (
        <CenteredLoader />
      ) : posts.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Nothing here yet" subtitle="Check back soon." />
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {posts.map((p) => (
            <View key={p.id} style={{ width: "48%" }}>
              <ArticleCard post={p} testID={`cat-post-${p.id}`} />
            </View>
          ))}
          {hasMore ? (
            <Pressable
              testID="cat-load-more"
              onPress={loadMore}
              disabled={loadingMore}
              style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.85 }, loadingMore && { opacity: 0.6 }]}
            >
              <Ionicons name={loadingMore ? "hourglass" : "chevron-down"} size={16} color={colors.brandSecondary} />
              <Text style={styles.loadMoreText}>{loadingMore ? "Loading…" : "Load more articles"}</Text>
            </Pressable>
          ) : (
            <View style={styles.endCap}>
              <Text style={styles.endCapText}>You&apos;re all caught up · {posts.length} articles</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5, marginTop: 2 },
  grid: {
    padding: spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    paddingBottom: 120,
  },
  loadMore: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMoreText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 14 },
  endCap: { width: "100%", alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.md },
  endCapText: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
});
