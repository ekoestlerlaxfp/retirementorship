import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, shadow } from "@/src/theme";
import { api, cachedApi, CategoryT } from "@/src/api/client";
import { CenteredLoader, EmptyState, H1, Muted } from "@/src/components/ui";

const CATEGORY_ART: Record<string, string> = {
  retirement: "https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?w=800",
  taxes: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800",
  investing: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
  "social-security": "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=800",
  medicare: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=800",
  "estate-planning": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800",
  insurance: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800",
  iras: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800",
  mindset: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=800",
  health: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800",
  hsa: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800",
  behavior: "https://images.unsplash.com/photo-1519834785169-98be25ec3f84?w=800",
  goals: "https://images.unsplash.com/photo-1481487196290-c152efe083f5?w=800",
  habits: "https://images.unsplash.com/photo-1506784365847-bbad939e9335?w=800",
  business: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800",
  charity: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800",
  debt: "https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=800",
  property: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800",
  workshop: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800",
  "creating-a-financial-plan": "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800",
  "cashflow-net-worth": "https://images.unsplash.com/photo-1554224155-a1487473ffd9?w=800",
  "financial-planning": "https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=800",
  "biblical-finance": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800",
  "financial-industry": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800",
  "ask-freeman": "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800",
  other: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800",
};

function artFor(slug: string) {
  return CATEGORY_ART[slug] || "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800";
}

export default function Learn() {
  const [cats, setCats] = useState<CategoryT[] | null>(null);
  useEffect(() => {
    cachedApi.categories({
      onCache: (d) => { if (d) setCats(d); },
      onFresh: (d) => setCats(d),
    }).then((d) => { if (d && !cats) setCats(d); }).catch(() => setCats([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cats) return <View style={styles.root}><CenteredLoader /></View>;
  if (!cats.length) return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} />
      <EmptyState icon="school-outline" title="Categories unavailable" />
    </View>
  );

  const featured = cats.slice(0, 3);
  const rest = cats.slice(3);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <SafeAreaView edges={["top"]}>
          <View style={styles.header}>
            <Text style={styles.kicker}>EXPLORE</Text>
            <H1 style={{ marginTop: 4 }}>Learn by topic</H1>
            <Muted style={{ marginTop: spacing.sm }}>
              Every topic curated by educators, not sales teams.
            </Muted>
          </View>
        </SafeAreaView>

        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {featured.map((c) => (
            <Pressable
              key={c.id}
              testID={`category-featured-${c.slug}`}
              onPress={() => router.push({ pathname: "/category/[id]", params: { id: String(c.id), name: c.name, slug: c.slug } })}
              style={({ pressed }) => [styles.featTile, pressed && { opacity: 0.93 }]}
            >
              <Image source={{ uri: artFor(c.slug) }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
              <LinearGradient colors={["rgba(35,31,32,0.1)", "rgba(35,31,32,0.85)"]} style={StyleSheet.absoluteFillObject} />
              <View style={styles.featContent}>
                <Text style={styles.featCount}>{c.count} LESSONS</Text>
                <Text style={styles.featTitle}>{c.name}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>ALL TOPICS</Text>
        <View style={styles.grid}>
          {rest.map((c) => (
            <Pressable
              key={c.id}
              testID={`category-tile-${c.slug}`}
              onPress={() => router.push({ pathname: "/category/[id]", params: { id: String(c.id), name: c.name, slug: c.slug } })}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}
            >
              <Image source={{ uri: artFor(c.slug) }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              <LinearGradient colors={["rgba(35,31,32,0.2)", "rgba(35,31,32,0.85)"]} style={StyleSheet.absoluteFillObject} />
              <View style={styles.tileContent}>
                <Text style={styles.tileCount}>{c.count}</Text>
                <Text style={styles.tileTitle} numberOfLines={2}>{c.name}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  featTile: {
    height: 180,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    ...shadow.card,
  },
  featContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg },
  featCount: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1.2, fontSize: 11, marginBottom: 4 },
  featTitle: { color: "#FFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  sectionLabel: {
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1.2,
    fontSize: 12,
    paddingHorizontal: spacing.xl,
    marginTop: spacing["2xl"],
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  tile: {
    width: "48%",
    height: 130,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  tileContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md },
  tileCount: { color: colors.brandPrimary, fontWeight: "800", fontSize: 20 },
  tileTitle: { color: "#FFF", fontSize: 15, fontWeight: "700", marginTop: 2 },
});
