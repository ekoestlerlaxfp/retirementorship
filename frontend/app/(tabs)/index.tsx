import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Text } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, stages, BRAND } from "@/src/theme";
import { api, type HomeFeed } from "@/src/api/client";
import { HeroCard, ArticleCard, TrendingCard, TipCard, Rail } from "@/src/components/cards";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { CenteredLoader, Muted, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";

export default function Home() {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem("rm_stage");
      setStage(s);
      const f = await api.homeFeed(s);
      setFeed(f);
    } catch (e) {
      console.warn("feed load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
