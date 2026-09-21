import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@react-native-vector-icons/ionicons";
import { advanceTip, localTipDay, restoreTipProgress, retirementTips, type TipProgress } from "../content/retirementTips";
import { colors, radius, shadow, spacing } from "../theme";

const KEY = "rm.retirement-tips.v1";
// Serialize writes across mounts so a rapid series of taps cannot save an older tip last.
let pendingSave: Promise<void> = Promise.resolve();
function saveProgress(progress: TipProgress) {
  pendingSave = pendingSave.then(() => AsyncStorage.setItem(KEY, JSON.stringify(progress))).catch(() => {});
}

export function RetirementTipCard() {
  const [progress, setProgress] = useState<TipProgress | null>(null);
  const current = useRef<TipProgress | null>(null);
  useEffect(() => {
    let active = true;
    const update = (next: TipProgress) => {
      current.current = next;
      setProgress(next);
      saveProgress(next);
    };
    const refreshDay = () => {
      const previous = current.current;
      const day = localTipDay();
      if (active && previous && previous.day !== day) update(advanceTip(previous, day));
    };
    void (async () => {
      await pendingSave;
      const raw = await AsyncStorage.getItem(KEY).catch(() => null);
      if (active) update(restoreTipProgress(raw, localTipDay()));
    })();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshDay();
    });
    const timer = setInterval(refreshDay, 60_000);
    return () => { active = false; subscription.remove(); clearInterval(timer); };
  }, []);

  const nextTip = () => {
    if (!current.current) return;
    const next = advanceTip(current.current, localTipDay());
    current.current = next;
    setProgress(next);
    saveProgress(next);
  };
  // Avoid flashing the first tip while restoring a returning reader's place.
  if (!progress) return null;
  const tip = retirementTips[progress.index];
  return (
    <View style={styles.card} testID="retirement-tip-card">
      <View style={styles.header}>
        <Ionicons name="sunny-outline" size={20} color={colors.brandPrimary} />
        <Text style={styles.label}>A MOMENT FOR YOUR RETIREMENT</Text>
      </View>
      <Text style={styles.category}>{tip.category}</Text>
      <Text style={styles.title} accessibilityRole="header">{tip.title}</Text>
      <Text style={styles.body}>{tip.body}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Show another retirement tip" onPress={nextTip}
        testID="next-retirement-tip" style={({ pressed }) => [styles.button, pressed && { opacity: 0.65 }]}>
        <Text style={styles.buttonText}>Another tip</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.brandSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.xl, backgroundColor: colors.surfaceTertiary, borderRadius: radius.xl,
    padding: spacing.xl, borderWidth: 0.5, borderColor: colors.brandTertiary, ...shadow.card },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  label: { flex: 1, color: colors.brandSecondary, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  category: { color: colors.brandSecondary, fontSize: 12, fontWeight: "600", marginBottom: spacing.sm },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md, letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 24, color: colors.onSurface },
  button: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: spacing.sm, minHeight: 44, marginTop: spacing.sm },
  buttonText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 15 },
});
