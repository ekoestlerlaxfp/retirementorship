import React from "react";
import { Pressable, StyleSheet, Text, View, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, spacing } from "../theme";
import { CALENDLY_URL } from "../theme";

export function AdvisorCTA({ compact = false, testID = "advisor-cta" }: { compact?: boolean; testID?: string }) {
  const onPress = () => Linking.openURL(CALENDLY_URL).catch(() => {});
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, compact && styles.wrapCompact, pressed && { opacity: 0.95 }]}
    >
      <LinearGradient
        colors={[colors.brandSecondary, "#3A2452", "#6A4A8E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.decoRing} pointerEvents="none" />
        <View style={styles.decoRing2} pointerEvents="none" />
        <View style={styles.content}>
          <View style={styles.badge}>
            <Ionicons name="chatbubble-ellipses" size={14} color={colors.onBrandPrimary} />
            <Text style={styles.badgeText}>1:1 GUIDANCE</Text>
          </View>
          <Text style={styles.title}>Talk to a retirement advisor</Text>
          <Text style={styles.subtitle}>
            Bring your questions. Get answers from a fiduciary planner — no pressure, no sales pitch.
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Book a discovery meeting</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.brandPrimary} />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.lg,
    overflow: "hidden",
    minHeight: 220,
    ...shadow.hero,
  },
  wrapCompact: { minHeight: 180 },
  gradient: { flex: 1, minHeight: 220 },
  content: { padding: spacing.xl, gap: spacing.md },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  title: {
    color: "#FFF",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: { color: "#E4D0AB", fontSize: 15, lineHeight: 22 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.5)",
  },
  ctaText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 15 },
  decoRing: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.15)",
    right: -100,
    top: -80,
  },
  decoRing2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.1)",
    right: -60,
    bottom: -60,
  },
});
