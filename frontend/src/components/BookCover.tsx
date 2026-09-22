import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { colors, radius, shadow, spacing } from "../theme";
import type { BookT, MagazineT } from "../api/client";
import { completedStore } from "../offline/completed";
import { useAuth } from "../context/auth";

const DEFAULT_GRADIENT = ["#4B3166", "#7A5B99"] as const;

function useIsComplete(id: string | number) {
  const [done, setDone] = useState<boolean>(() => completedStore.has(String(id)));
  useEffect(() => completedStore.subscribe((set) => setDone(set.has(String(id)))), [id]);
  return done;
}

function LockCornerBadge() {
  return (
    <View style={badgeStyles.lockWrap} pointerEvents="none">
      <Ionicons name="lock-closed" size={12} color="#231F20" />
    </View>
  );
}

function CompleteBadge() {
  return (
    <View style={badgeStyles.wrap} pointerEvents="none">
      <Ionicons name="checkmark" size={14} color="#FFF" />
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.success || "#2E7D5B",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  lockWrap: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});

export function BookCover({
  book,
  width = 168,
  height = 240,
  onPress,
  style,
  progress,
}: {
  book: BookT;
  width?: number;
  height?: number;
  onPress?: () => void;
  style?: ViewStyle;
  progress?: number; // 0..1
}) {
  const grad = (book.cover_gradient && book.cover_gradient.length >= 2 ? book.cover_gradient : DEFAULT_GRADIENT) as any;
  const accent = book.accent || colors.brandPrimary;
  const go = () => (onPress ? onPress() : router.push({ pathname: "/book/[id]", params: { id: String(book.id) } }));
  const pct = Math.max(0, Math.min(1, progress || 0));
  const done = useIsComplete(book.id);
  const { user } = useAuth();
  // Books/magazines are member-only; guides remain public and share the
  // BookCover component in some places, so key off the id prefix.
  const isMemberOnly = !String(book.id).startsWith("guide-");
  const locked = isMemberOnly && !user;
  return (
    <Pressable
      testID={`book-cover-${book.id}`}
      onPress={go}
      style={({ pressed }) => [{ width, height }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      <View style={[styles.cover, { width, height, borderRadius: radius.md }]}>
        {book.image ? (
          <Image onError={(event) => console.warn("[RM image] book", book.id, event.error)} source={{ uri: book.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
        {!book.image && (
          <>
            <View style={[styles.spine, { backgroundColor: accent }]} pointerEvents="none" />
            <View style={styles.foil} pointerEvents="none">
              <Text style={[styles.foilRM, { color: accent }]}>RM</Text>
            </View>
            <View style={styles.textWrap} pointerEvents="none">
              <View style={[styles.rule, { backgroundColor: accent }]} />
              <Text style={styles.title} numberOfLines={4}>{book.title}</Text>
              {book.author ? <Text style={styles.author} numberOfLines={1}>{book.author}</Text> : null}
            </View>
          </>
        )}
        {pct > 0 && !locked ? (
          <View testID={`book-progress-${book.id}`} style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${Math.max(6, Math.round(pct * 100))}%`, backgroundColor: accent }]} />
          </View>
        ) : null}
        {locked ? <LockCornerBadge /> : done ? <CompleteBadge /> : null}
      </View>
    </Pressable>
  );
}

export function MagazineCover({
  mag,
  width = 168,
  height = 220,
}: {
  mag: MagazineT & { issue_label?: string; cover_gradient?: string[]; accent?: string };
  width?: number;
  height?: number;
}) {
  const grad = (mag.cover_gradient && mag.cover_gradient.length >= 2 ? mag.cover_gradient : [colors.brandPrimary, "#B0793A"]) as any;
  const accent = mag.accent || "#FFF";
  const label = mag.issue_label || "ISSUE";
  const done = useIsComplete(mag.id);
  const { user } = useAuth();
  const locked = !user;
  // Always route through the detail page so the AuthGate is honoured for
  // signed-out viewers. Signed-in members can still tap through instantly.
  const onTap = () => router.push({ pathname: "/book/[id]", params: { id: String(mag.id) } });
  return (
    <Pressable
      testID={`mag-cover-${mag.id}`}
      onPress={onTap}
      style={({ pressed }) => [{ width, height }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[styles.magCover, { width, height, borderRadius: radius.md }]}>
        {mag.image ? (
          <Image onError={(event) => console.warn("[RM image] magazine", mag.id, event.error)} source={{ uri: mag.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
        {!mag.image ? (
          <>
            <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.65)"]} style={[StyleSheet.absoluteFill, { pointerEvents: "none" as any }]} />
            <View style={[styles.textWrap, { pointerEvents: "none" as any }]}>
              <View style={[styles.rule, { backgroundColor: accent, width: 32 }]} />
              <Text style={styles.title} numberOfLines={3}>{mag.title}</Text>
              {mag.subtitle ? (
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 4, letterSpacing: 0.3 }} numberOfLines={2}>
                  {mag.subtitle}
                </Text>
              ) : null}
            </View>
            <View style={[styles.magStamp, { pointerEvents: "none" as any }]}>
              <Ionicons name="newspaper" size={12} color="#FFF" />
              <Text style={styles.magStampText}>{label}</Text>
            </View>
          </>
        ) : label.toUpperCase().startsWith("EVERGREEN") ? (
          <View style={[styles.magStamp, { pointerEvents: "none" as any, backgroundColor: "rgba(31,70,51,0.9)" }]}>
            <Ionicons name="leaf" size={12} color="#FFF" />
            <Text style={styles.magStampText}>EVERGREEN</Text>
          </View>
        ) : null}
        {locked ? <LockCornerBadge /> : done ? <CompleteBadge /> : null}
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
    pointerEvents: "none" as any,
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
    pointerEvents: "none" as any,
  },
  foilRM: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  textWrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    pointerEvents: "none" as any,
  },
  rule: { height: 2, width: 24, marginBottom: 6, opacity: 0.9 },
  title: { color: "#FFF", fontSize: 15, lineHeight: 19, fontWeight: "800", letterSpacing: -0.2 },
  author: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginTop: 4, textTransform: "uppercase" },
  progressTrack: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.35)",
    pointerEvents: "none" as any,
  },
  progressFill: { height: "100%" },
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
