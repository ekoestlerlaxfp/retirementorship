import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, Linking, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { colors, spacing, radius, shadow } from "@/src/theme";
import { H1, Muted, GoldPill } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { api, type GuideT } from "@/src/api/client";

type Section = "calculators" | "guides";

const TOOLS = [
  {
    id: "roth-conversion",
    name: "Roth Conversion Calculator",
    subtitle: "Model conversions and long-term tax savings.",
    icon: "swap-horizontal" as const,
    url: "https://lacrossefinancialplanning.com/roth-conversion-calculator/",
    available: true,
  },
  {
    id: "rmd",
    name: "RMD Calculator",
    subtitle: "Estimate your required minimum distributions.",
    icon: "calendar" as const,
    url: "https://lacrossefinancialplanning.com/rmd-calculator/",
    available: true,
  },
  {
    id: "ss-tax",
    name: "Social Security Taxability",
    subtitle: "How much of your benefit is taxed?",
    icon: "shield-checkmark" as const,
    url: "https://lacrossefinancialplanning.com/social-security-taxability-calculator/",
    available: true,
  },
];

export default function Tools() {
  const [tab, setTab] = useState<Section>("calculators");
  const [guides, setGuides] = useState<GuideT[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadGuides = useCallback(async () => {
    try {
      const data = await api.guides();
      setGuides(data);
    } catch {
      setGuides([]);
    }
  }, []);

  useEffect(() => { loadGuides(); }, [loadGuides]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadGuides().finally(() => setRefreshing(false));
  }, [loadGuides]);

  const open = (url: string) => { if (url) Linking.openURL(url).catch(() => {}); };
  const openGuide = (g: GuideT) => {
    if (g.pdf_url) router.push({ pathname: "/book/read/[id]", params: { id: String(g.id) } });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>PLAN WITH CONFIDENCE</Text>
          <H1 style={{ marginTop: 4 }}>Retirement tools</H1>
          <Muted style={{ marginTop: spacing.sm }}>
            Simple, honest calculators and guides built for real decisions.
          </Muted>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={{ flexGrow: 0 }}
        >
          {([
            { id: "calculators", label: "Calculators", icon: "calculator" as const, count: TOOLS.length },
            { id: "guides", label: "Guides", icon: "document-text" as const, count: guides?.length ?? 0 },
          ] as { id: Section; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; count: number }[]).map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                testID={`tools-tab-${t.id}`}
                onPress={() => setTab(t.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons name={t.icon} size={16} color={active ? "#FFF" : colors.brandSecondary} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                {t.count > 0 ? (
                  <View style={[styles.count, active && styles.countActive]}>
                    <Text style={[styles.countText, active && { color: colors.brandSecondary }]}>{t.count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {tab === "calculators" ? (
          <View style={styles.list}>
            {TOOLS.map((t) => (
              <Pressable
                key={t.id}
                testID={`tool-${t.id}`}
                onPress={() => (t.available ? open(t.url) : null)}
                style={({ pressed }) => [styles.tool, pressed && t.available && { opacity: 0.94 }, !t.available && { opacity: 0.6 }]}
              >
                <View style={styles.toolIcon}>
                  <LinearGradient colors={[colors.brandPrimary, "#B08E48"]} style={styles.toolIconGrad} />
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
        ) : (
          <GuidesSection guides={guides} onOpen={openGuide} />
        )}

        <View style={{ marginTop: spacing.xl }}>
          <AdvisorCTA testID="tools-advisor-cta" />
        </View>
      </ScrollView>
    </View>
  );
}

function GuidesSection({ guides, onOpen }: { guides: GuideT[] | null; onOpen: (g: GuideT) => void }) {
  if (!guides) return null;
  if (!guides.length) {
    return (
      <View style={styles.comingWrap}>
        <View style={styles.comingIcon}>
          <Ionicons name="document-text-outline" size={28} color={colors.brandPrimary} />
        </View>
        <Text style={styles.comingTitle}>Guides coming soon</Text>
        <Muted style={{ textAlign: "center", marginTop: spacing.sm, maxWidth: 300 }}>
          Flowcharts, tax guides, and downloadable checklists will land here.
        </Muted>
      </View>
    );
  }
  return (
    <View style={styles.guideList}>
      {guides.map((g) => (
        <Pressable
          key={String(g.id)}
          testID={`guide-${g.id}`}
          onPress={() => onOpen(g)}
          style={({ pressed }) => [styles.guideCard, pressed && { opacity: 0.94 }]}
        >
          <View style={styles.guideThumb}>
            {g.image ? (
              <Image source={{ uri: g.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
            ) : (
              <LinearGradient
                colors={(g.cover_gradient as any) || [colors.brandSecondary, "#6A4A8E"]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            )}
            <View style={styles.guidePill}>
              <Ionicons name="document-text" size={11} color="#FFF" />
              <Text style={styles.guidePillText}>{(g.category || "GUIDE").toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.guideBody}>
            <Text style={styles.guideTitle} numberOfLines={2}>{g.title}</Text>
            {g.subtitle ? <Text style={styles.guideSub} numberOfLines={2}>{g.subtitle}</Text> : null}
            <View style={styles.guideMetaRow}>
              <Ionicons name="download-outline" size={13} color={colors.brandSecondary} />
              <Text style={styles.guideMetaText}>
                {g.pages ? `${g.pages} pg · PDF` : "PDF"}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  tabsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.md, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 0.5,
    borderColor: colors.border,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  chipText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 14 },
  chipTextActive: { color: "#FFF" },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  countActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  countText: { fontSize: 11, fontWeight: "800", color: colors.brandSecondary },

  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
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
  toolIconGrad: { ...StyleSheet.absoluteFillObject },
  toolTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  toolSub: { fontSize: 14, color: colors.muted },

  guideList: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  guideCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  guideThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceTertiary,
  },
  guidePill: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  guidePillText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  guideBody: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 4 },
  guideTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.3 },
  guideSub: { fontSize: 13.5, lineHeight: 19, color: colors.muted },
  guideMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  guideMetaText: { fontSize: 12.5, color: colors.brandSecondary, fontWeight: "700" },

  comingWrap: {
    alignItems: "center",
    paddingTop: spacing["2xl"],
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  comingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  comingTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, textAlign: "center", letterSpacing: -0.3 },
});
