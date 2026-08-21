import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, StyleSheet, ScrollView, Text, TextInput, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { api, WPPost, type CategoryT } from "@/src/api/client";
import { EmptyState, Muted } from "@/src/components/ui";

const PER_PAGE = 20;

export default function Search() {
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<number | null>(null);
  const [cats, setCats] = useState<CategoryT[]>([]);
  const [results, setResults] = useState<WPPost[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<any>(null);
  const requestSeq = useRef(0);

  // Load categories once — used to power the topic chips.
  useEffect(() => {
    api.categories().then((c) => setCats(c || [])).catch(() => setCats([]));
  }, []);

  const runSearch = useCallback(
    async (text: string, opts: { cat: number | null; page: number; append: boolean }) => {
      const t = text.trim();
      if (!t) { setResults(null); setHasMore(false); setPage(1); setTotal(null); return; }
      const mySeq = ++requestSeq.current;

      if (opts.append) setLoadingMore(true); else setLoading(true);
      // Kick off the total count in parallel (only on fresh searches, not append).
      const fetchCount = () =>
        api.postsCount({ search: t, category: opts.cat || undefined })
          .then((c) => c.total || 0)
          .catch(() => 0);
      if (!opts.append) {
        fetchCount().then((n) => {
          if (mySeq !== requestSeq.current) return;
          setTotal(n);
          // WP sometimes rate-limits cold — retry once after a beat.
          if (n === 0) {
            setTimeout(() => {
              fetchCount().then((m) => { if (mySeq === requestSeq.current && m > 0) setTotal(m); });
            }, 1500);
          }
        });
      }
      try {
        const params: any = { search: t, per_page: PER_PAGE, page: opts.page };
        if (opts.cat) params.category = opts.cat;
        const raw = await api.posts(params);
        if (mySeq !== requestSeq.current) return; // discard stale response
        setResults((prev) => {
          if (!opts.append) return raw || [];
          const seen = new Set((prev || []).map((x) => x.id));
          return [...(prev || []), ...(raw || []).filter((x) => !seen.has(x.id))];
        });
        setPage(opts.page);
        setHasMore((raw?.length || 0) >= PER_PAGE);
      } catch {
        if (!opts.append) setResults([]);
      } finally {
        if (mySeq === requestSeq.current) {
          if (opts.append) setLoadingMore(false); else setLoading(false);
        }
      }
    },
    []
  );

  // Debounced initial search when query or category changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => runSearch(q, { cat: catFilter, page: 1, append: false }),
      350
    );
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, catFilter, runSearch]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    runSearch(q, { cat: catFilter, page: page + 1, append: true });
  }, [loading, loadingMore, hasMore, q, catFilter, page, runSearch]);

  // Top few categories by count for the filter chips.
  const topCats = useMemo(
    () => [...cats].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8),
    [cats]
  );

  const totalShown = results?.length || 0;
  const activeCat = catFilter ? cats.find((c) => c.id === catFilter) : null;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="search-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={colors.muted} />
            <TextInput
              testID="search-input"
              value={q}
              onChangeText={setQ}
              placeholder="Search articles, videos, topics..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoFocus
              returnKeyType="search"
            />
            {q.length > 0 && (
              <Pressable testID="search-clear" onPress={() => setQ("")} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Category filter chips */}
        {topCats.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
            style={{ flexGrow: 0 }}
          >
            <Pressable
              testID="search-cat-all"
              onPress={() => setCatFilter(null)}
              style={[styles.catChip, catFilter === null && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, catFilter === null && styles.catChipTextActive]}>All topics</Text>
            </Pressable>
            {topCats.map((c) => {
              const active = catFilter === c.id;
              return (
                <Pressable
                  key={c.id}
                  testID={`search-cat-${c.id}`}
                  onPress={() => setCatFilter(active ? null : c.id)}
                  style={[styles.catChip, active && styles.catChipActive]}
                >
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {q.length === 0 ? (
          <View style={{ padding: spacing.xl }}>
            <Text style={styles.emptyKicker}>SEARCH THE WHOLE LIBRARY</Text>
            <Text style={styles.emptyTitle}>What are you curious about?</Text>
            <Muted style={{ marginTop: spacing.md }}>
              Try &ldquo;roth conversion&rdquo;, &ldquo;medicare&rdquo;, &ldquo;social security&rdquo;, &ldquo;annuity&rdquo;, or a topic you&apos;re researching. Filter by topic below.
            </Muted>
            {topCats.length > 0 ? (
              <>
                <Text style={styles.suggestLabel}>POPULAR TOPICS</Text>
                <View style={styles.suggestWrap}>
                  {topCats.slice(0, 6).map((c) => (
                    <Pressable
                      key={c.id}
                      testID={`search-suggest-${c.id}`}
                      onPress={() => { setCatFilter(c.id); setQ(c.name); }}
                      style={styles.suggestChip}
                    >
                      <Ionicons name="pricetag" size={12} color={colors.brandSecondary} />
                      <Text style={styles.suggestText}>{c.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : loading ? (
          <View style={{ padding: spacing.xl }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : totalShown === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No results"
            subtitle={`Nothing found for "${q}"${activeCat ? ` in ${activeCat.name}` : ""}. Try clearing filters or a different keyword.`}
          />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: 140 }}>
            <Text style={styles.countText}>
              {total && total > totalShown
                ? `Showing ${totalShown} of ${total}${activeCat ? ` in ${activeCat.name}` : ""} for “${q}”`
                : `${totalShown} ${totalShown === 1 ? "result" : "results"}${activeCat ? ` in ${activeCat.name}` : ""} for “${q}”`}
            </Text>
            {(results || []).map((p) => (
              <Pressable
                key={p.id}
                testID={`search-result-${p.id}`}
                onPress={() => router.push({ pathname: "/article/[id]", params: { id: String(p.id) } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
              >
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.thumb} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.thumb, { alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons
                      name={p.type === "video" ? "play-circle" : "document-text"}
                      size={30}
                      color={colors.brandPrimary}
                    />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    {p.category && <Text style={styles.rowCat}>{p.category.name.toUpperCase()}</Text>}
                    {p.type === "video" ? (
                      <View style={styles.videoDot}>
                        <Ionicons name="play" size={9} color="#FFF" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={3}>{p.title}</Text>
                  <Text style={styles.rowMeta}>
                    {p.date ? new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""}
                    {p.date ? " · " : ""}
                    {p.type === "video" ? "Watch" : `${p.reading_time} min read`}
                  </Text>
                </View>
              </Pressable>
            ))}

            {hasMore ? (
              <Pressable
                testID="search-load-more"
                onPress={loadMore}
                disabled={loadingMore}
                style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.85 }, loadingMore && { opacity: 0.6 }]}
              >
                <Ionicons name={loadingMore ? "hourglass" : "chevron-down"} size={16} color={colors.brandSecondary} />
                <Text style={styles.loadMoreText}>
                  {loadingMore
                    ? "Loading…"
                    : total && total > totalShown
                      ? `Load ${Math.min(PER_PAGE, total - totalShown)} more`
                      : "Load more results"}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.endCap}>
                <Text style={styles.endCapText}>End of results · {totalShown} shown</Text>
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill, paddingHorizontal: spacing.lg,
    minHeight: 48, borderWidth: 1, borderColor: colors.border,
  },
  input: {
    flex: 1, fontSize: 16, color: colors.onSurface, paddingVertical: 8,
    // @ts-ignore web only — kill Chrome's outline
    outlineStyle: "none" as any,
  },
  chipRow: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.sm, alignItems: "center" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 34, paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 0.5, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  chipText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#FFF" },

  catRow: { paddingHorizontal: spacing.lg, gap: 6, paddingBottom: spacing.md, alignItems: "center" },
  catChip: {
    height: 30, paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  catChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary },
  catChipText: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  catChipTextActive: { color: colors.onBrandTertiary, fontWeight: "800" },

  countText: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 4 },

  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, minHeight: 96,
  },
  thumb: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowCat: { color: colors.brandPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 0.8 },
  videoDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, lineHeight: 20 },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },

  loadMore: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: spacing.sm, paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  loadMoreText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 14 },
  endCap: { alignItems: "center", paddingTop: spacing.md, paddingBottom: spacing.md },
  endCapText: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },

  emptyKicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.4 },
  emptyTitle: { fontSize: 28, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5, marginTop: 4 },
  suggestLabel: { marginTop: spacing.xl, color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  suggestWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  suggestChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  suggestText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 13 },
});
