import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Text } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, stages, BRAND } from "@/src/theme";
import { api, cachedApi, type HomeFeed } from "@/src/api/client";
import { HeroCard, ArticleCard, TrendingCard, TipCard, Rail } from "@/src/components/cards";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { CenteredLoader, Muted, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import { progress as progressStore, type ProgressEntry } from "@/src/offline";
import { Image as ExpoImage } from "expo-image";

function ContinueCard({ entry }: { entry: ProgressEntry }) {
  return (
    <Pressable
      testID={`continue-card-${entry.post_id}`}
      onPress={() => router.push({ pathname: "/article/[id]", params: { id: String(entry.post_id) } })}
      style={({ pressed }) => [{ width: 280 }, pressed && { opacity: 0.9 }]}
    >
      <View style={{ height: 160, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary, marginBottom: spacing.md }}>
        {entry.image ? (
          <ExpoImage source={{ uri: entry.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        ) : null}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(255,255,255,0.35)" }}>
          <View style={{ width: `${Math.max(6, Math.round(entry.progress * 100))}%`, height: "100%", backgroundColor: colors.brandPrimary }} />
        </View>
      </View>
      {entry.category ? <Text style={{ color: colors.brandPrimary, fontWeight: "800", letterSpacing: 0.8, fontSize: 11, marginBottom: 4 }}>{entry.category.toUpperCase()}</Text> : null}
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface, lineHeight: 22 }} numberOfLines={3}>{entry.title}</Text>
      <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "500", marginTop: 4 }}>
        {Math.round(entry.progress * 100)}% read
      </Text>
    </Pressable>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [continueReading, setContinueReading] = useState<ProgressEntry[]>([]);
  const { user } = useAuth();

  const load = useCallback(async () => {
    const s = await AsyncStorage.getItem("rm_stage");
    setStage(s);
    // Cache-first, then refresh
    await cachedApi.homeFeed(s, {
      onCache: (cached) => {
        if (cached) { setFeed(cached); setLoading(false); }
      },
      onFresh: (fresh) => { setFeed(fresh); setLoading(false); setRefreshing(false); },
      onError: () => { setLoading(false); setRefreshing(false); },
    });
    // Continue Reading rail (local progress)
    setContinueReading(await progressStore.recent(6));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const stageLabel = stages.find((s) => s.id === stage)?.label;

  if (loading) return <View style={styles.root}><CenteredLoader /></View>;
  if (!feed || (!feed.hero && !feed.latest?.length)) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={["top"]} />
        <EmptyState title="No content yet" subtitle="Pull down to retry." icon="newspaper-outline" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <SafeAreaView edges={["top"]}>
          <View style={styles.brandRow}>
            <Image source={{ uri: BRAND.logoUrl }} style={styles.brandLogo} contentFit="contain" transition={200} />
            <Text style={styles.brandName}>{BRAND.name}</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              testID="header-search-button"
              onPress={() => router.push("/search")}
              style={styles.iconBtn}
              hitSlop={12}
            >
              <Ionicons name="search" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{stageLabel ? stageLabel.toUpperCase() : "WELCOME"}</Text>
              <Text style={styles.tagline}>
                {BRAND.taglineLine1}{"\n"}
                <Text style={{ color: colors.brandPrimary }}>{BRAND.taglineLine2}</Text>
              </Text>
            </View>
          </View>
        </SafeAreaView>

        {feed.hero && (
          <View style={{ marginBottom: spacing["2xl"] }}>
            <HeroCard post={feed.hero} />
          </View>
        )}

        {feed.tip && (
          <View style={{ marginBottom: spacing["2xl"] }}>
            <TipCard post={feed.tip} />
          </View>
        )}

        {continueReading.length > 0 && (
          <Rail
            testID="rail-continue"
            title="Continue reading"
            subtitle="Pick up where you left off"
            data={continueReading}
            renderItem={(p) => (
              <ContinueCard entry={p} />
            )}
          />
        )}

        <Rail
          testID="rail-latest"
          title="Latest articles"
          subtitle="Fresh from the desk of your mentors"
          data={feed.latest}
          renderItem={(p) => <ArticleCard post={p} />}
        />

        {feed.videos?.length > 0 && (
          <Rail
            testID="rail-videos"
            title="Watch & learn"
            subtitle="Short, focused video lessons"
            data={feed.videos}
            renderItem={(p) => <ArticleCard post={p} />}
          />
        )}

        {feed.trending?.length > 0 && (
          <Rail
            testID="rail-trending"
            title="Trending this week"
            data={feed.trending}
            renderItem={(p, i) => <TrendingCard post={p} rank={i + 1} />}
          />
        )}

        <View style={{ marginBottom: spacing["2xl"] }}>
          <AdvisorCTA />
        </View>

        <Rail
          testID="rail-recommended"
          title="Recommended for you"
          subtitle={stage ? "Chosen for your stage" : "Popular picks"}
          data={feed.featured}
          renderItem={(p) => <ArticleCard post={p} />}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  brandLogo: { width: 32, height: 22 },
  brandName: { color: colors.brandSecondary, fontWeight: "800", fontSize: 15, letterSpacing: 0.4 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  tagline: {
    marginTop: 6,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: -0.4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
