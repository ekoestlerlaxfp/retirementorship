import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, stages, BRAND } from "@/src/theme";
import { PrimaryButton, SecondaryButton, H1, Muted } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/api/client";

const STAGE_KEY = "rm_stage";

export default function Onboarding() {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { user } = useAuth();

  useEffect(() => {
    (async () => {
      const s = await AsyncStorage.getItem(STAGE_KEY);
      if (s) setSelected(s);
    })();
  }, []);

  const onContinue = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await AsyncStorage.setItem(STAGE_KEY, selected);
      if (user) {
        try { await api.onboarding(selected); } catch {}
      }
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
  };

  const onSkip = async () => {
    // Persist a sentinel so we don't ask the user again on every launch.
    // We use "skipped" (not empty) so `!!stage` in index.tsx passes.
    try { await AsyncStorage.setItem(STAGE_KEY, "skipped"); } catch {}
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.brandSecondary, "#3A2452"]}
        style={styles.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <SafeAreaView edges={["top"]} style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
          <View style={styles.brand}>
            <Image
              source={{ uri: BRAND.logoUrl }}
              style={styles.brandLogo}
              contentFit="contain"
              transition={200}
            />
            <Text style={styles.brandText}>{BRAND.name}</Text>
          </View>
          <Text style={styles.heroKicker}>WELCOME</Text>
          <Text style={styles.heroTitle}>
            {BRAND.taglineLine1}
            {"\n"}
            <Text style={{ color: colors.brandPrimary }}>{BRAND.taglineLine2}</Text>
          </Text>
          <Muted style={styles.heroSub}>
            Your mentor to and through retirement.
          </Muted>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing["3xl"] }}>
        <H1>Where are you on the journey?</H1>
        <Muted style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
          We'll tailor your feed to what matters right now.
        </Muted>

        {stages.map((s) => {
          const active = selected === s.id;
          return (
            <Pressable
              key={s.id}
              testID={`stage-option-${s.id}`}
              onPress={() => setSelected(s.id)}
              style={({ pressed }) => [styles.stage, active && styles.stageActive, pressed && { opacity: 0.9 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.stageLabel, active && { color: colors.brandSecondary }]}>{s.label}</Text>
                <Text style={styles.stageSub}>{s.subtitle}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <Ionicons name="checkmark" size={18} color="#fff" />}
              </View>
            </Pressable>
          );
        })}

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <PrimaryButton
            testID="onboarding-continue"
            label="Continue"
            onPress={onContinue}
            disabled={!selected}
            loading={busy}
            icon="arrow-forward"
          />
          <SecondaryButton testID="onboarding-skip" label="Skip for now" onPress={onSkip} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { paddingBottom: spacing["2xl"] },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  brandLogo: { width: 36, height: 24 },
  brandText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  heroKicker: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  heroTitle: {
    color: "#FFF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroSub: { color: "#E4D0AB", fontSize: 15, lineHeight: 22, marginTop: spacing.md, maxWidth: 320 },
  scroll: { flex: 1, backgroundColor: colors.surface, marginTop: -spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  stage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 72,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  stageActive: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  stageLabel: { fontSize: 17, fontWeight: "700", color: colors.onSurface, marginBottom: 2 },
  stageSub: { fontSize: 14, color: colors.muted },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
});
