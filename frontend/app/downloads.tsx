import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { H1, Muted, EmptyState, SecondaryButton } from "@/src/components/ui";
import { downloads, DownloadItem, formatBytes, cache, cacheSize, progress as progressStore } from "@/src/offline";

export default function DownloadsScreen() {
  const [items, setItems] = useState<DownloadItem[] | null>(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [cacheItems, setCacheItems] = useState(0);
  const [progressCount, setProgressCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const [list, bytes, cBytes, keys, progList] = await Promise.all([
      downloads.list(),
      downloads.totalBytes(),
      cacheSize(),
      cache.keys(),
      progressStore.list(),
    ]);
    setItems(list);
    setTotalBytes(bytes);
    setCacheBytes(cBytes);
    setCacheItems(keys.length);
    setProgressCount(progList.length);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = downloads.subscribe(() => refresh());
    return () => { unsub(); };
  }, [refresh]);

  const onClearCache = useCallback(async () => {
    await cache.purgeAll();
    refresh();
  }, [refresh]);

  const onDelete = useCallback(async (id: string) => {
    await downloads.remove(id);
    refresh();
  }, [refresh]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="downloads-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>OFFLINE</Text>
            <H1 style={{ marginTop: 4 }}>Downloads & storage</H1>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh(); }} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Ionicons name="save-outline" size={20} color={colors.brandSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Cached content</Text>
              <Muted>{cacheItems} items • {formatBytes(cacheBytes)}</Muted>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Ionicons name="cloud-download-outline" size={20} color={colors.brandSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Offline downloads</Text>
              <Muted>{items?.length ?? 0} items • {formatBytes(totalBytes)}</Muted>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Ionicons name="book-outline" size={20} color={colors.brandSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Reading progress</Text>
              <Muted>{progressCount} articles tracked</Muted>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>DOWNLOADED FILES</Text>
        {items === null ? null : items.length === 0 ? (
          <EmptyState
            testID="downloads-empty"
            icon="cloud-download-outline"
            title="Nothing downloaded yet"
            subtitle="Books, magazines, and flowcharts you save for offline will appear here."
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {items.map((it) => (
              <View key={it.id} style={styles.item} testID={`download-item-${it.id}`}>
                <View style={styles.itemIcon}>
                  <Ionicons name={iconForKind(it.kind)} size={22} color={colors.brandSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{it.title}</Text>
                  <Text style={styles.itemMeta}>
                    {it.kind.toUpperCase()} • {it.status === "ready" ? formatBytes(it.bytes) : it.status === "downloading" ? `${Math.round(it.progress * 100)}%` : it.status}
                  </Text>
                  {it.status === "downloading" && (
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${Math.round(it.progress * 100)}%` }]} />
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={() => onDelete(it.id)}
                  testID={`download-delete-${it.id}`}
                  hitSlop={12}
                  style={({ pressed }) => [styles.iconBtnSm, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>MANAGE</Text>
        <SecondaryButton
          testID="downloads-clear-cache"
          label={`Clear cached content (${formatBytes(cacheBytes)})`}
          onPress={onClearCache}
          icon="refresh-outline"
        />
      </ScrollView>
    </View>
  );
}

function iconForKind(k: string): keyof typeof Ionicons.glyphMap {
  switch (k) {
    case "book": return "book-outline";
    case "magazine": return "newspaper-outline";
    case "flowchart": return "git-network-outline";
    case "pdf": return "document-text-outline";
    case "image": return "image-outline";
    case "article":
    default: return "reader-outline";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  iconBtnSm: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  summaryCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  summaryLabel: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: 2 },
  summaryDivider: { height: 1, backgroundColor: colors.divider },
  sectionLabel: {
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1.2,
    fontSize: 11,
    marginTop: spacing.md,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  itemTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, lineHeight: 20 },
  itemMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  progressBar: {
    height: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 2, marginTop: 6, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.brandPrimary },
});
