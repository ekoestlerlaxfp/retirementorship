import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, Linking, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
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
  const [guideSection, setGuideSection] = useState<string>("All");

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

  // Distinct section names, preserving first-seen order (matches feed order).
  const sectionOptions = React.useMemo<string[]>(() => {
    if (!guides) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of guides) {
      const s = g.section || "Guides";
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
  }, [guides]);

  const filteredGuides = React.useMemo<GuideT[] | null>(() => {
    if (!guides) return null;
    if (guideSection === "All") return guides;
    return guides.filter((g) => (g.section || "Guides") === guideSection);
  }, [guides, guideSection]);

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
        {tab === "guides" && sectionOptions.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subPillsRow}
            style={{ flexGrow: 0 }}
          >
            {(["All", ...sectionOptions] as string[]).map((s) => {
              const active = guideSection === s;
              const count = s === "All" ? (guides?.length ?? 0) : (guides || []).filter((g) => (g.section || "Guides") === s).length;
              return (
                <Pressable
                  key={s}
                  testID={`guide-section-${s}`}
                  onPress={() => setGuideSection(s)}
                  style={[styles.subPill, active && styles.subPillActive]}
                >
                  <Text style={[styles.subPillText, active && styles.subPillTextActive]}>{s}</Text>
                  <View style={[styles.subCount, active && styles.subCountActive]}>
                    <Text style={[styles.subCountText, active && { color: colors.brandSecondary }]}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
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
          <GuidesSection guides={filteredGuides} onOpen={openGuide} showSectionHeaders={guideSection === "All"} />
        )}

        <View style={{ marginTop: spacing.xl }}>
          <AdvisorCTA testID="tools-advisor-cta" />
        </View>
      </ScrollView>
    </View>
  );
}

function GuidesSection({ guides, onOpen, showSectionHeaders = true }: { guides: GuideT[] | null; onOpen: (g: GuideT) => void; showSectionHeaders?: boolean }) {
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
  // Group by section, preserving first-seen order.
  const sections: { name: string; items: GuideT[] }[] = [];
  const byName = new Map<string, GuideT[]>();
  for (const g of guides) {
    const key = g.section || "Guides";
    if (!byName.has(key)) {
      byName.set(key, []);
      sections.push({ name: key, items: byName.get(key)! });
    }
    byName.get(key)!.push(g);
  }
  return (
    <View style={{ paddingTop: spacing.md }}>
      {sections.map((s) => (
        <View key={s.name} style={{ marginTop: spacing.md }}>
          {showSectionHeaders ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{s.name}</Text>
              <Text style={styles.sectionCount}>
                {s.items.length} {s.items.length === 1 ? "guide" : "guides"}
              </Text>
            </View>
          ) : null}
          <View style={styles.guideList}>
            {s.items.map((g) => {
              const cat = (g.category || "GUIDE").toLowerCase();
              const iconName: React.ComponentProps<typeof Ionicons>["name"] = cat.includes("flowchart")
                ? "git-branch-outline"
                : cat.includes("checklist")
                ? "checkbox-outline"
                : cat.includes("reference")
                ? "book-outline"
                : "document-text-outline";
              return (
                <Pressable
                  key={String(g.id)}
                  testID={`guide-${g.id}`}
                  onPress={() => onOpen(g)}
                  style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.94, backgroundColor: colors.surfaceTertiary }]}
                >
                  <View style={styles.guideIcon}>
                    <Ionicons name={iconName} size={20} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1, minHeight: 46, justifyContent: "center" }}>
                    <Text style={styles.guideTitle} numberOfLines={2}>{g.title}</Text>
                    {g.subtitle ? <Text style={styles.guideSub} numberOfLines={1}>{g.subtitle}</Text> : null}
                    <View style={styles.guideMetaRow}>
                      <Text style={styles.guideCat}>{(g.category || "GUIDE").toUpperCase()}</Text>
                      <Text style={styles.guideDot}>•</Text>
                      <Text style={styles.guideMetaText}>{g.pages ? `${g.pages} pg · PDF` : "PDF"}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        </View>
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

  subPillsRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: "center",
  },
  subPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    flexShrink: 0,
  },
  subPillActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  subPillText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 12.5, letterSpacing: 0.1 },
  subPillTextActive: { color: colors.onBrandPrimary },
  subCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  subCountActive: { backgroundColor: "rgba(255,255,255,0.92)" },
  subCountText: { fontSize: 10.5, fontWeight: "800", color: colors.brandSecondary },

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

  guideList: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: 0 },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  guideIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  guideCard: {
    // kept for backwards compat / future thumbnail-style variant
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
  guideTitle: { fontSize: 15.5, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.2, lineHeight: 20 },
  guideSub: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  guideMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  guideCat: { fontSize: 10, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 1.1 },
  guideDot: { fontSize: 10, color: colors.muted, marginTop: -1 },
  guideMetaText: { fontSize: 11.5, color: colors.muted, fontWeight: "700", letterSpacing: 0.2 },
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.brandPrimary,
    letterSpacing: 1.2,
  },

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
