import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { api, WPPost } from "@/src/api/client";
import { EmptyState, Muted } from "@/src/components/ui";

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WPPost[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);

  const runSearch = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) { setResults(null); return; }
    setLoading(true);
    try {
      const r = await api.posts({ search: t, per_page: 20 });
      setResults(r);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, runSearch]);

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
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {q.length === 0 ? (
          <View style={{ padding: spacing.xl }}>
            <Muted>Try "roth conversion", "medicare", "social security"…</Muted>
          </View>
        ) : loading ? (
          <View style={{ padding: spacing.xl }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : results && results.length === 0 ? (
          <EmptyState icon="search-outline" title="No results" subtitle={`Nothing found for “${q}”.`} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: 120 }}>
            {(results || []).map((p) => (
              <Pressable
                key={p.id}
                testID={`search-result-${p.id}`}
                onPress={() => router.push({ pathname: "/article/[id]", params: { id: String(p.id) } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
              >
                <Image source={{ uri: p.image }} style={styles.thumb} contentFit="cover" transition={150} />
                <View style={{ flex: 1 }}>
                  {p.category && <Text style={styles.rowCat}>{p.category.name.toUpperCase()}</Text>}
                  <Text style={styles.rowTitle} numberOfLines={3}>{p.title}</Text>
                  <Text style={styles.rowMeta}>{p.reading_time} min read</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
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
  input: { flex: 1, fontSize: 16, color: colors.onSurface, paddingVertical: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, minHeight: 96,
  },
  thumb: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowCat: { color: colors.brandPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 0.8, marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, lineHeight: 20 },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },
});
