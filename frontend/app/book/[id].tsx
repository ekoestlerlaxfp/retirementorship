import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, type as typo, CALENDLY_URL } from "@/src/theme";
import { cachedApi, type BookT } from "@/src/api/client";
import { BookCover } from "@/src/components/BookCover";
import { CenteredLoader, GoldPill, Muted, PrimaryButton, SecondaryButton } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { Linking } from "react-native";

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [book, setBook] = useState<BookT | null>(null);

  useEffect(() => {
    if (!id) return;
    cachedApi.book(id, {
      onCache: (d) => { if (d) setBook(d); },
      onFresh: (d) => setBook(d),
    }).then((d) => { if (d && !book) setBook(d); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!book) return <View style={styles.root}><CenteredLoader /></View>;

  const grad = (book.cover_gradient && book.cover_gradient.length >= 2 ? book.cover_gradient : ["#4B3166", "#7A5B99"]) as any;
  const hasContent = !!(book.content_html && book.content_html.trim());

  const onShare = async () => {
    try { await Share.share({ message: `${book.title} — RetireMentorship`, title: book.title }); } catch {}
  };
  const onTalk = () => Linking.openURL(CALENDLY_URL).catch(() => {});

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        <LinearGradient colors={grad} style={styles.headerBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <SafeAreaView edges={["top"]} style={styles.topBar}>
            <Pressable testID="book-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable testID="book-share" onPress={onShare} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="share-outline" size={20} color="#FFF" />
            </Pressable>
          </SafeAreaView>
          <View style={styles.coverWrap}>
            <BookCover book={book} width={200} height={286} onPress={() => {}} />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <GoldPill label="Book" testID="book-badge" />
          <Text style={styles.title} testID="book-title">{book.title}</Text>
          {book.subtitle ? <Text style={styles.subtitle}>{book.subtitle}</Text> : null}
          {book.author ? <Text style={styles.author}>By {book.author}</Text> : null}

          <View style={styles.metaRow}>
            {book.chapters ? (
              <View style={styles.metaChip}>
                <Ionicons name="list-outline" size={16} color={colors.brandSecondary} />
                <Text style={styles.metaChipText}>{book.chapters} chapters</Text>
              </View>
            ) : null}
            {book.reading_time ? (
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={16} color={colors.brandSecondary} />
                <Text style={styles.metaChipText}>{book.reading_time} min</Text>
              </View>
            ) : null}
          </View>

          {book.excerpt ? <Text style={styles.excerpt}>{book.excerpt}</Text> : null}

          <View style={{ marginTop: spacing["2xl"], gap: spacing.md }}>
            {hasContent ? (
              <PrimaryButton testID="book-start" label="Start reading" onPress={() => {}} icon="book" />
            ) : (
              <View style={styles.comingSoonCard}>
                <Ionicons name="hourglass-outline" size={20} color={colors.brandSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.comingSoonTitle}>Full book coming soon</Text>
                  <Muted>We're publishing this on RetireMentorship. In the meantime, get a 1:1 walk-through.</Muted>
                </View>
              </View>
            )}
            <SecondaryButton testID="book-talk" label="Talk to a mentor about this" onPress={onTalk} icon="chatbubble-ellipses" />
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <AdvisorCTA compact testID="book-advisor-cta" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headerBg: { paddingBottom: spacing["3xl"] },
  topBar: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.35)",
  },
  coverWrap: { alignItems: "center", marginTop: spacing.lg },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: {
    fontSize: typo.sizes["2xl"], lineHeight: typo.sizes["2xl"] * 1.15,
    fontWeight: "800", color: colors.onSurface, letterSpacing: -0.6, marginTop: spacing.md,
  },
  subtitle: { fontSize: 18, lineHeight: 26, color: colors.onSurface, marginTop: spacing.md, opacity: 0.85 },
  author: { fontSize: 14, color: colors.muted, marginTop: spacing.md, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill,
  },
  metaChipText: { color: colors.brandSecondary, fontSize: 13, fontWeight: "700" },
  excerpt: { fontSize: 17, lineHeight: 28, color: colors.onSurface, marginTop: spacing.xl },
  comingSoonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 0.5, borderColor: colors.border,
    ...shadow.card,
  },
  comingSoonTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginBottom: 2 },
});
