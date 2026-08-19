import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { api, WPPost } from "@/src/api/client";
import { ArticleCard } from "@/src/components/cards";
import { CenteredLoader, EmptyState, Muted } from "@/src/components/ui";

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string; slug: string }>();
  const [posts, setPosts] = useState<WPPost[] | null>(null);

  useEffect(() => {
    if (!id) return;
    api.posts({ category: Number(id), per_page: 20 }).then(setPosts).catch(() => setPosts([]));
  }, [id]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="cat-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>TOPIC</Text>
            <Text style={styles.title}>{name}</Text>
          </View>
        </View>
      </SafeAreaView>

      {!posts ? (
        <CenteredLoader />
      ) : posts.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Nothing here yet" subtitle="Check back soon." />
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {posts.map((p) => (
            <View key={p.id} style={{ width: "48%" }}>
              <ArticleCard post={p} testID={`cat-post-${p.id}`} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5, marginTop: 2 },
  grid: {
    padding: spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    paddingBottom: 120,
  },
});
