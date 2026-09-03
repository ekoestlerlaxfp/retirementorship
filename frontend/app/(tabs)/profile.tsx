import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radius, stages, BRAND } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { H1, Muted, Avatar, PrimaryButton, SecondaryButton } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { api } from "@/src/api/client";

export default function Profile() {
  const { user, signOut } = useAuth();
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("rm_stage").then(setStage);
  }, [user]);

  const stageLabel = stages.find((s) => s.id === (user?.retirement_stage || stage))?.label;
  const displayName = user
    ? ((user.first_name || user.last_name)
        ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
        : (user.name || user.email))
    : "Guest";

  const rows: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; testID: string }[] = [
    { icon: "bookmark-outline", label: "My bookmarks", onPress: () => router.push("/(tabs)/library"), testID: "profile-bookmarks" },
    { icon: "time-outline", label: "Reading history", onPress: () => router.push("/(tabs)/library"), testID: "profile-history" },
    { icon: "cloud-download-outline", label: "Downloads & storage", onPress: () => router.push("/downloads"), testID: "profile-downloads" },
    { icon: "school-outline", label: "Browse topics", onPress: () => router.push("/(tabs)/learn"), testID: "profile-topics" },
    { icon: "options-outline", label: "Update retirement stage", onPress: () => router.push("/onboarding"), testID: "profile-stage" },
    {
      icon: "chatbubbles-outline",
      label: "Ask us a question",
      onPress: () => router.push(user ? "/feedback" : "/(auth)/login"),
      testID: "profile-feedback",
    },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={["top"]}>
          <View style={styles.header}>
            <Text style={styles.kicker}>YOU</Text>
            <H1 style={{ marginTop: 4 }}>Profile</H1>
          </View>
        </SafeAreaView>

        <View style={styles.card}>
          <Avatar url={user?.picture ?? undefined} name={displayName} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {user?.email && <Muted>{user.email}</Muted>}
            {stageLabel && <Text style={styles.stageBadge}>{stageLabel}</Text>}
          </View>
        </View>

        {!user && (
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.xl, gap: spacing.md }}>
            <PrimaryButton testID="profile-signin" label="Sign in" onPress={() => router.push("/(auth)/login")} icon="log-in" />
            <SecondaryButton testID="profile-signup" label="Create free account" onPress={() => router.push("/(auth)/register")} icon="person-add" />
            <Muted style={{ textAlign: "center", marginTop: spacing.sm }}>
              Save bookmarks, track progress, and personalize your feed.
            </Muted>
          </View>
        )}

        <View style={styles.rowsWrap}>
          {rows.map((r) => (
            <Pressable
              key={r.testID}
              testID={r.testID}
              onPress={r.onPress}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon} size={20} color={colors.brandSecondary} />
              </View>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <AdvisorCTA testID="profile-advisor-cta" />
        </View>

        {user && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <SecondaryButton testID="profile-signout" label="Sign out" onPress={signOut} icon="log-out-outline" />
          </View>
        )}

        <View style={styles.footer}>
          <Image source={{ uri: BRAND.logoUrl }} style={styles.footerLogo} contentFit="contain" transition={200} />
          <Text style={styles.footerBrand}>{BRAND.name}</Text>
          <Muted style={{ textAlign: "center", marginTop: 4 }}>
            {BRAND.taglineLine1} {BRAND.taglineLine2}
          </Muted>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  stageBadge: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    color: colors.onBrandTertiary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
  },
  rowsWrap: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.onSurface },
  footer: { alignItems: "center", padding: spacing["2xl"], marginTop: spacing.xl },
  footerLogo: { width: 48, height: 32, marginBottom: spacing.sm },
  footerBrand: { color: colors.brandSecondary, fontWeight: "800", fontSize: 16, letterSpacing: 0.5, marginBottom: 4 },
});
