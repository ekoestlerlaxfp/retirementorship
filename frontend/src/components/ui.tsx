import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { colors, radius, shadow, spacing, type as typo } from "../theme";

export const H1 = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => (
  <Text style={[styles.h1, style]}>{children}</Text>
);
export const H2 = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => (
  <Text style={[styles.h2, style]}>{children}</Text>
);
export const H3 = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => (
  <Text style={[styles.h3, style]}>{children}</Text>
);
export const Body = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => (
  <Text style={[styles.body, style]}>{children}</Text>
);
export const Muted = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => (
  <Text style={[styles.muted, style]}>{children}</Text>
);

export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const PrimaryButton = ({
  label,
  onPress,
  testID,
  icon,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, disabled && { opacity: 0.5 }]}
  >
    <LinearGradient colors={[colors.brandSecondary, "#6A4A8E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradFill}>
      {loading ? (
        <ActivityIndicator color={colors.onBrandSecondary} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={colors.onBrandSecondary} style={{ marginRight: spacing.sm }} />}
          <Text style={styles.primaryBtnText}>{label}</Text>
        </>
      )}
    </LinearGradient>
  </Pressable>
);

export const SecondaryButton = ({
  label,
  onPress,
  testID,
  icon,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) => (
  <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}>
    {icon && <Ionicons name={icon} size={18} color={colors.brandSecondary} style={{ marginRight: spacing.sm }} />}
    <Text style={styles.secondaryBtnText}>{label}</Text>
  </Pressable>
);

export const GoldPill = ({ label, testID }: { label: string; testID?: string }) => (
  <View testID={testID} style={styles.goldPill}>
    <Text style={styles.goldPillText}>{label}</Text>
  </View>
);

export const CompletePill = ({ testID, compact = false }: { testID?: string; compact?: boolean }) => (
  <View testID={testID} style={[styles.completePill, compact && { paddingVertical: 3, paddingHorizontal: 8 }]}>
    <Ionicons name="checkmark-circle" size={compact ? 12 : 14} color="#FFF" />
    <Text style={[styles.completePillText, compact && { fontSize: 10 }]}>COMPLETE</Text>
  </View>
);

export const EmptyState = ({
  icon = "sparkles-outline",
  title,
  subtitle,
  testID,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  testID?: string;
}) => (
  <View testID={testID} style={styles.empty}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name={icon} size={32} color={colors.brandPrimary} />
    </View>
    <H3 style={{ textAlign: "center" }}>{title}</H3>
    {subtitle && <Muted style={{ textAlign: "center", marginTop: spacing.sm }}>{subtitle}</Muted>}
  </View>
);

export const CenteredLoader = ({ testID }: { testID?: string }) => (
  <View testID={testID} style={styles.loader}>
    <ActivityIndicator color={colors.brandPrimary} size="large" />
  </View>
);

export const Avatar = ({ url, name, size = 40 }: { url?: string; name?: string; size?: number }) => {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary }}
        contentFit="cover"
      />
    );
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandTertiary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.onBrandTertiary, fontWeight: "700", fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  h1: {
    fontSize: typo.sizes["2xl"],
    lineHeight: typo.sizes["2xl"] * 1.2,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: typo.sizes.xl,
    lineHeight: typo.sizes.xl * 1.25,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: typo.sizes.lg,
    lineHeight: typo.sizes.lg * 1.3,
    fontWeight: "700",
    color: colors.onSurface,
  },
  body: { fontSize: typo.sizes.base, lineHeight: typo.sizes.base * 1.5, color: colors.onSurface },
  muted: { fontSize: typo.sizes.sm, lineHeight: typo.sizes.sm * 1.4, color: colors.muted },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  primaryBtn: { borderRadius: radius.pill, overflow: "hidden", minHeight: 52 },
  gradFill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    minHeight: 52,
  },
  primaryBtnText: { color: colors.onBrandSecondary, fontSize: typo.sizes.base, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.brandSecondary, fontSize: typo.sizes.base, fontWeight: "700" },
  goldPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  goldPillText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  completePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success || "#2E7D5B",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  completePillText: { color: "#FFF", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing["3xl"] },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
