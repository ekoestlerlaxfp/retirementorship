import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
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
      style={({ pressed }) => [styles.hero, pressed && { opacity: 0.95 }]}
    >
      <Image
        source={{ uri: post.image || "https://images.unsplash.com/photo-1611558245524-aff4541a18d2?w=1200" }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        transition={300}
      />
      <LinearGradient colors={["transparent", "rgba(35,31,32,0.85)"]} style={StyleSheet.absoluteFillObject} />
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
          source={{ uri: post.image || "https://images.unsplash.com/photo-1611558245524-aff4541a18d2?w=800" }}
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

export function TipCard({ post }: { post: WPPost }) {
  return (
    <Pressable
      testID={`tip-card-${post.id}`}
      onPress={() => openPost(post)}
      style={({ pressed }) => [styles.tipCard, pressed && { opacity: 0.95 }]}
    >
      <View style={styles.tipHead}>
        <Ionicons name="sunny-outline" size={20} color={colors.brandPrimary} />
        <Text style={styles.tipLabel}>TODAY'S RETIREMENT TIP</Text>
      </View>
      <Text style={styles.tipTitle} numberOfLines={4}>
        {post.title}
      </Text>
      <Text style={styles.tipExcerpt} numberOfLines={3}>
        {post.excerpt}
      </Text>
      <View style={styles.tipCta}>
        <Text style={styles.tipCtaText}>Read the tip</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.brandSecondary} />
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
    height: 380,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    ...shadow.hero,
  },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.xl, gap: spacing.md },
  heroTitle: {
    color: "#FFF",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  heroMetaText: { color: "#F0E6D2", fontSize: 14, fontWeight: "600" },
  artCard: {
    width: 260,
    backgroundColor: "transparent",
  },
  artImageWrap: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    marginBottom: spacing.md,
  },
  artImage: { width: "100%", height: "100%" },
  artCategory: {
    color: colors.brandPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  artTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  artMeta: { fontSize: 13, color: colors.muted, fontWeight: "500" },
  playBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(75,49,102,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  trendCard: {
    width: 300,
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trendRank: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.brandPrimary,
    letterSpacing: -2,
    width: 40,
  },
  trendTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: 4,
  },
  tipCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.brandTertiary,
    ...shadow.card,
  },
  tipHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  tipLabel: {
    color: colors.brandSecondary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },
  tipTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
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
