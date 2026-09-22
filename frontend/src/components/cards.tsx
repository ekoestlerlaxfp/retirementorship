import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { colors, radius, shadow, spacing, type as typo } from "../theme";
import type { WPPost } from "../api/client";
import { H2, H3, Muted, GoldPill } from "./ui";

function openPost(p: WPPost) {
  router.push({ pathname: "/article/[id]", params: { id: String(p.id) } });
}

export function HeroCard({ post }: { post: WPPost }) {
  return (
    <Pressable
      testID={`hero-card-${post.id}`}
      onPress={() => openPost(post)}
      style={({ pressed }) => [styles.hero, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <Image
        onError={(event) => console.warn("[RM image]", post.id, event.error)}
        source={{ uri: post.image || "https://images.unsplash.com/photo-1611558245524-aff4541a18d2?w=1200" }}
        style={styles.heroImage}
        contentFit="contain"
        transition={300}
      />
      <View style={styles.heroRing} pointerEvents="none" />
      <View style={styles.heroContent}>
        {post.category && <GoldPill label={post.category.name} />}
        <Text style={styles.heroTitle} numberOfLines={3}>
          {post.title}
        </Text>
        <View style={styles.heroMeta}>
          <Ionicons name={post.type === "video" ? "play-circle" : "time-outline"} size={16} color="#F0E6D2" />
          <Text style={styles.heroMetaText}>
            {post.type === "video" ? "Watch now" : `${post.reading_time} min read`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function ArticleCard({ post, testID }: { post: WPPost; testID?: string }) {
  return (
    <Pressable
      testID={testID || `article-card-${post.id}`}
      onPress={() => openPost(post)}
      style={({ pressed }) => [styles.artCard, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.artImageWrap}>
        <Image
          onError={(event) => console.warn("[RM image]", post.id, event.error)}
        source={{ uri: post.thumbnail || post.image || "https://images.unsplash.com/photo-1611558245524-aff4541a18d2?w=800" }}
          style={styles.artImage}
          contentFit="cover"
          transition={200}
        />
        {post.type === "video" && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={16} color="#fff" />
          </View>
        )}
      </View>
      {post.category && <Text style={styles.artCategory}>{post.category.name.toUpperCase()}</Text>}
      <Text style={styles.artTitle} numberOfLines={3}>
        {post.title}
      </Text>
      <Text style={styles.artMeta}>{post.reading_time} min read</Text>
    </Pressable>
  );
}

export function TrendingCard({ post, rank }: { post: WPPost; rank: number }) {
  return (
    <Pressable
      testID={`trending-card-${post.id}`}
      onPress={() => openPost(post)}
      style={({ pressed }) => [styles.trendCard, pressed && { opacity: 0.9 }]}
    >
      <Text style={styles.trendRank}>{rank}</Text>
      <View style={{ flex: 1 }}>
        {post.category && <Text style={styles.artCategory}>{post.category.name.toUpperCase()}</Text>}
        <Text style={styles.trendTitle} numberOfLines={3}>
          {post.title}
        </Text>
        <Text style={styles.artMeta}>{post.reading_time} min read</Text>
      </View>
    </Pressable>
  );
}

export function Rail<T>({
  title,
  subtitle,
  data,
  renderItem,
  testID,
}: {
  title: string;
  subtitle?: string;
  data: T[];
  renderItem: (item: T, i: number) => React.ReactNode;
  testID?: string;
}) {
  if (!data?.length) return null;
  return (
    <View style={styles.railWrap} testID={testID}>
      <View style={styles.railHeader}>
        <View style={{ flex: 1 }}>
          <H2>{title}</H2>
          {subtitle && <Muted style={{ marginTop: 2 }}>{subtitle}</Muted>}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}
      >
        {data.map((item, i) => (
          <React.Fragment key={(item as any).id ?? i}>{renderItem(item, i)}</React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: "#231F20",
    ...shadow.hero,
  },
  heroImage: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#231F20" },
  heroRing: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: radius.xl,
    borderWidth: 0.5,
    borderColor: "rgba(197,160,89,0.35)",
  },
  heroContent: { padding: spacing.lg, gap: spacing.sm },
  heroTitle: {
    color: "#FFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  heroMetaText: { color: "#F0E6D2", fontSize: 14, fontWeight: "600" },
  artCard: { width: 280, backgroundColor: "transparent" },
  artImageWrap: {
    width: "100%",
    height: 176,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    marginBottom: spacing.md,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.04)",
  },
  artImage: { width: "100%", height: "100%" },
  artCategory: {
    color: colors.brandPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  artTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.xs,
    letterSpacing: -0.2,
  },
  artMeta: { fontSize: 13, color: colors.muted, fontWeight: "500" },
  playBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(75,49,102,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  trendCard: {
    width: 320,
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  trendRank: {
    fontSize: 44,
    fontWeight: "800",
    color: colors.brandPrimary,
    letterSpacing: -2,
    width: 44,
  },
  trendTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  tipCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 0.5,
    borderColor: colors.brandTertiary,
    ...shadow.card,
  },
  tipHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  tipLabel: {
    color: colors.brandSecondary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.2,
  },
  tipTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.md,
    letterSpacing: -0.4,
  },
  tipExcerpt: { fontSize: 15, lineHeight: 22, color: colors.onSurface, opacity: 0.85 },
  tipCta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  tipCtaText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 15 },
  railWrap: { marginBottom: spacing["2xl"] },
  railHeader: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
  },
});
