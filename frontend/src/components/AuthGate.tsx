// RetireMentorship — Free Member Access gate.
// Renders a polished inline "unlock" card for exclusive content (books,
// magazines) when the current viewer is not signed in. Both buttons carry
// the current pathname + id forward via query params so the auth flow can
// return the user to the exact page they were reading.

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { colors, radius, shadow, spacing, type as typo } from "@/src/theme";

export type AuthGateProps = {
  /** Route to return to after successful auth, e.g. "/book/[id]" */
  returnPath?: string;
  /** id to bundle into the return path (typically book/magazine id) */
  returnId?: string;
  /** Optional custom headline; defaults to "Your next chapter starts here." */
  headline?: string;
  /** Optional supporting copy shown under the headline */
  subtitle?: string;
  /** Optional label above the headline; defaults to "Free Member Access" */
  eyebrow?: string;
  /** Callback fired when the user taps the (X) dismiss button */
  onDismiss?: () => void;
  /** Optional testID prefix, defaults to "auth-gate" */
  testID?: string;
};

const DEFAULT_HEADLINE = "Your next chapter starts here.";
const DEFAULT_SUBTITLE =
  "Create your free RetireMentorship account to unlock books, magazines, and the complete member library.";

export function AuthGate({
  returnPath,
  returnId,
  headline = DEFAULT_HEADLINE,
  subtitle = DEFAULT_SUBTITLE,
  eyebrow = "Free Member Access",
  onDismiss,
  testID = "auth-gate",
}: AuthGateProps) {
  const goRegister = () => {
    router.push({
      pathname: "/(auth)/register",
      params: returnPath ? { next: returnPath, nextId: returnId || "" } : {},
    });
  };
  const goLogin = () => {
    router.push({
      pathname: "/(auth)/login",
      params: returnPath ? { next: returnPath, nextId: returnId || "" } : {},
    });
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <LinearGradient
        colors={["#2A1B45", "#4B3166"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          testID={`${testID}-dismiss`}
          hitSlop={16}
          style={styles.dismiss}
        >
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
        </Pressable>
      ) : null}
      <View style={styles.badge}>
        <Ionicons name="lock-closed" size={12} color="#231F20" />
        <Text style={styles.badgeText}>{eyebrow}</Text>
      </View>
      <Text style={styles.headline} testID={`${testID}-headline`}>
        {headline}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={{ height: spacing.lg }} />
      <Pressable
        onPress={goRegister}
        testID={`${testID}-primary`}
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="sparkles" size={16} color="#231F20" />
        <Text style={styles.primaryLabel}>Create Free Account</Text>
      </Pressable>
      <Pressable
        onPress={goLogin}
        testID={`${testID}-secondary`}
        style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.secondaryLabel}>Sign In</Text>
      </Pressable>
      <View style={styles.fineWrap}>
        <Ionicons name="checkmark-circle" size={14} color="rgba(255,255,255,0.7)" />
        <Text style={styles.fine}>No subscription • No payment</Text>
      </View>
    </View>
  );
}

/**
 * A small chip meant to sit inside a book/magazine detail hero when the
 * viewer is signed-out, giving them the same "Free Member Access" cue
 * that the gate below reinforces.
 */
export function LockedBadge({
  label = "Free Member Access",
  testID = "locked-badge",
}: {
  label?: string;
  testID?: string;
}) {
  return (
    <View style={styles.miniBadge} testID={testID}>
      <Ionicons name="lock-closed" size={12} color="#FFF" />
      <Text style={styles.miniBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    padding: spacing.xl,
    overflow: "hidden",
    ...shadow.card,
    borderWidth: 0.5,
    borderColor: "rgba(197,160,89,0.35)",
  },
  dismiss: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: "#231F20",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headline: {
    color: "#FFF",
    fontSize: typo.sizes.xl,
    lineHeight: typo.sizes.xl * 1.15,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: spacing.md,
  },
  subtitle: {
    color: "rgba(255,253,250,0.82)",
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    color: "#231F20",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  fineWrap: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  fine: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  miniBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(35,31,32,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  miniBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
