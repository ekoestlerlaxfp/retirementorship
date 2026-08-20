import React from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, shadow } from "@/src/theme";
import { H1, Muted, GoldPill } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";

const TOOLS = [
  {
    id: "compound",
    name: "Compound Interest Calculator",
    subtitle: "See how time grows your money.",
    icon: "trending-up" as const,
    url: "https://retirementorship.com/compound-interest-calculator/",
    available: true,
  },
  {
    id: "ss-tax",
    name: "Social Security Taxability",
    subtitle: "How much of your benefit is taxed?",
    icon: "shield-checkmark" as const,
    url: "https://retirementorship.com/social-security-taxability-calculator/",
    available: true,
  },
  {
    id: "mortgage",
    name: "Mortgage Calculator",
    subtitle: "Plan payments and payoff.",
    icon: "home" as const,
    url: "https://retirementorship.com/mortgage-calculator/",
    available: true,
  },
];

export default function Tools() {
  const open = (url: string) => { if (url) Linking.openURL(url).catch(() => {}); };
  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <SafeAreaView edges={["top"]}>
          <View style={styles.header}>
            <Text style={styles.kicker}>PLAN WITH CONFIDENCE</Text>
            <H1 style={{ marginTop: 4 }}>Retirement tools</H1>
            <Muted style={{ marginTop: spacing.sm }}>
              Simple, honest calculators built for real decisions.
            </Muted>
          </View>
        </SafeAreaView>

        <View style={styles.list}>
          {TOOLS.map((t) => (
            <Pressable
              key={t.id}
              testID={`tool-${t.id}`}
              onPress={() => (t.available ? open(t.url) : null)}
              style={({ pressed }) => [styles.tool, pressed && t.available && { opacity: 0.94 }, !t.available && { opacity: 0.6 }]}
            >
              <View style={styles.toolIcon}>
                <LinearGradient
                  colors={[colors.brandPrimary, "#B08E48"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <Ionicons name={t.icon} size={24} color={colors.onBrandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={styles.toolTitle}>{t.name}</Text>
                  {!t.available && <GoldPill label="Soon" />}
                </View>
                <Text style={styles.toolSub}>{t.subtitle}</Text>
              </View>
              {t.available && <Ionicons name="chevron-forward" size={22} color={colors.muted} />}
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <AdvisorCTA testID="tools-advisor-cta" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  list: { paddingHorizontal: spacing.xl, gap: spacing.md },
  tool: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toolIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  toolSub: { fontSize: 14, color: colors.muted },
});
