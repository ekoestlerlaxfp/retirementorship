import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, Modal, Alert, Linking, Platform } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radius, stages, BRAND, PRIVACY_URL, TERMS_URL, SUPPORT_EMAIL } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { H1, Muted, Avatar, PrimaryButton, SecondaryButton } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { api } from "@/src/api/client";

export default function Profile() {
  const { user, signOut, deleteAccount } = useAuth();
  const [stage, setStage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("rm_stage").then(setStage);
  }, [user]);

  const openUrl = (url: string) => Linking.openURL(url).catch(() => {});
  const openSupport = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("RetireMentorship support")}`).catch(() => {});

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      setConfirmDelete(false);
      // Land the user on the login screen with a soft heads-up.
      router.replace("/(auth)/login");
      // Use setTimeout so the alert doesn't get swallowed by the transition.
      setTimeout(() => {
        if (Platform.OS !== "web") {
          Alert.alert("Account deleted", "Your account and personal data have been removed.");
        }
      }, 200);
    } catch (e: any) {
      Alert.alert("Couldn't delete account", String(e?.message || "Please try again in a moment."));
    } finally {
      setDeleting(false);
    }
  };

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
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.md }}>
            <SecondaryButton testID="profile-signout" label="Sign out" onPress={signOut} icon="log-out-outline" />
            <Pressable
              testID="profile-delete-account"
              onPress={() => setConfirmDelete(true)}
              style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error || "#B3261E"} />
              <Text style={styles.dangerLabel}>Delete my account</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.legalWrap}>
          <Pressable testID="profile-privacy" onPress={() => openUrl(PRIVACY_URL)}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable testID="profile-terms" onPress={() => openUrl(TERMS_URL)}>
            <Text style={styles.legalLink}>Terms of Use</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable testID="profile-support" onPress={openSupport}>
            <Text style={styles.legalLink}>Contact support</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Image source={{ uri: BRAND.logoUrl }} style={styles.footerLogo} contentFit="contain" transition={200} />
          <Text style={styles.footerBrand}>{BRAND.name}</Text>
          <Muted style={{ textAlign: "center", marginTop: 4 }}>
            {BRAND.taglineLine1} {BRAND.taglineLine2}
          </Muted>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={confirmDelete}
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard} testID="delete-confirm-modal">
            <View style={styles.modalIconBubble}>
              <Ionicons name="warning-outline" size={22} color={colors.error || "#B3261E"} />
            </View>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              This permanently removes your RetireMentorship account, bookmarks, reading history,
              completed items, and downloaded books. It cannot be undone.
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable
                testID="delete-confirm-button"
                onPress={onDelete}
                disabled={deleting}
                style={({ pressed }) => [styles.modalDanger, (pressed || deleting) && { opacity: 0.85 }]}
              >
                <Text style={styles.modalDangerLabel}>
                  {deleting ? "Deleting…" : "Delete my account"}
                </Text>
              </Pressable>
              <Pressable
                testID="delete-cancel-button"
                onPress={() => setConfirmDelete(false)}
                disabled={deleting}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.modalCancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error || "#B3261E",
    backgroundColor: "transparent",
  },
  dangerLabel: { color: colors.error || "#B3261E", fontWeight: "700", fontSize: 15 },
  legalWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    gap: 6,
  },
  legalLink: { color: colors.brandSecondary, fontWeight: "700", fontSize: 13 },
  legalDot: { color: colors.muted, fontSize: 13 },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  modalIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(179, 38, 30, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  modalBody: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  modalDanger: {
    backgroundColor: colors.error || "#B3261E",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  modalDangerLabel: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  modalCancel: {
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  modalCancelLabel: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  footer: { alignItems: "center", padding: spacing["2xl"], marginTop: spacing.xl },
  footerLogo: { width: 48, height: 32, marginBottom: spacing.sm },
  footerBrand: { color: colors.brandSecondary, fontWeight: "800", fontSize: 16, letterSpacing: 0.5, marginBottom: 4 },
});
