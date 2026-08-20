import React from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors, radius, shadow, spacing } from "../theme";
import type { BookT, MagazineT } from "../api/client";

const DEFAULT_GRADIENT = ["#4B3166", "#7A5B99"] as const;

export function BookCover({
  book,
  width = 168,
  height = 240,
  onPress,
  style,
}: {
  book: BookT;
  width?: number;
  height?: number;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const grad = (book.cover_gradient && book.cover_gradient.length >= 2 ? book.cover_gradient : DEFAULT_GRADIENT) as any;
  const accent = book.accent || colors.brandPrimary;
  const go = () => (onPress ? onPress() : router.push({ pathname: "/book/[id]", params: { id: String(book.id) } }));
  return (
    <Pressable
      testID={`book-cover-${book.id}`}
      onPress={go}
      style={({ pressed }) => [{ width, height }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      <View style={[styles.cover, { width, height, borderRadius: radius.md }]}>
        {book.image ? (
          <>
            <Image source={{ uri: book.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFillObject} />
          </>
        ) : (
          <LinearGradient colors={grad} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
        {/* Spine accent */}
        <View style={[styles.spine, { backgroundColor: accent }]} />
        {/* Foil monogram */}
        <View style={styles.foil}>
          <Text style={[styles.foilRM, { color: accent }]}>RM</Text>
        </View>
        {/* Title & author */}
        <View style={styles.textWrap}>
          <View style={[styles.rule, { backgroundColor: accent }]} />
          <Text style={styles.title} numberOfLines={4}>{book.title}</Text>
          {book.author ? <Text style={styles.author} numberOfLines={1}>{book.author}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function MagazineCover({
  mag,
  width = 168,
  height = 220,
}: {
  mag: MagazineT;
  width?: number;
  height?: number;
}) {
  return (
    <Pressable
      testID={`mag-cover-${mag.id}`}
      onPress={() => {}}
      style={({ pressed }) => [{ width, height }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[styles.magCover, { width, height, borderRadius: radius.md }]}>
        {mag.image ? (
          <Image source={{ uri: mag.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={[colors.brandPrimary, "#B0793A"]} style={StyleSheet.absoluteFillObject} />
        )}
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={3}>{mag.title}</Text>
        </View>
        <View style={styles.magStamp}>
          <Ionicons name="newspaper" size={12} color="#FFF" />
          <Text style={styles.magStampText}>ISSUE</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: {
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    ...shadow.hero,
  },
  magCover: {
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    ...shadow.card,
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    opacity: 0.9,
  },
  foil: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  foilRM: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  textWrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  rule: { height: 2, width: 24, marginBottom: 6, opacity: 0.9 },
  title: { color: "#FFF", fontSize: 15, lineHeight: 19, fontWeight: "800", letterSpacing: -0.2 },
  author: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginTop: 4, textTransform: "uppercase" },
  magStamp: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  magStampText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});
