import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, spacing, type as typo, CALENDLY_URL } from "@/src/theme";
import { api, cachedApi, type BookT } from "@/src/api/client";
import { BookCover } from "@/src/components/BookCover";
import { CenteredLoader, CompletePill, GoldPill, Muted, PrimaryButton, SecondaryButton } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { bookProgress, type BookProgress, downloads, formatBytes, useCompleted } from "@/src/offline";
import { useAuth } from "@/src/context/auth";
import { Linking } from "react-native";

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [book, setBook] = useState<BookT | null>(null);
  const [progress, setProgress] = useState<BookProgress | null>(null);
  const [downloaded, setDownloaded] = useState<{ ready: boolean; bytes: number } | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const { user } = useAuth();
  const { isComplete, markComplete, unmarkComplete } = useCompleted();

  const refresh = useCallback(async (bookId: string) => {
    const p = await bookProgress.get(bookId);
    setProgress(p);
    const dl = await downloads.get(bookId);
    setDownloaded(dl ? { ready: dl.status === "ready", bytes: dl.bytes || 0 } : null);
  }, []);

  useEffect(() => {
    if (!id) return;
    cachedApi.book(id, {
      onCache: (d) => { if (d) { setBook(d); refresh(String(d.id)); } },
      onFresh: (d) => { setBook(d); refresh(String(d.id)); },
    }).catch(() => {});
    // Pull latest progress from server on view
    bookProgress.syncFromServer().then(() => { if (id) refresh(id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // When we have the book + user, record history and load bookmark state
  useEffect(() => {
    if (!book || !user) return;
    const kind = String(book.id).startsWith("mag-") ? "magazine" : "book";
    api.addHistory({
      post_id: String(book.id),
      title: book.title,
      image: book.image || book.hero_image || null,
      category: book.author || null,
      type: kind,
      progress: 0.02,
    }).catch(() => {});
    api.bookmarkIds().then((ids) => setBookmarked(ids.includes(String(book.id)))).catch(() => {});
  }, [book, user]);

  // Refresh progress whenever this screen regains focus (returning from the reader)
  useFocusEffect(
    useCallback(() => {
      if (id) refresh(id);
    }, [id, refresh])
  );

  const toggleBookmark = useCallback(async () => {
    if (!book) return;
    if (!user) { router.push("/(auth)/login"); return; }
    const kind = String(book.id).startsWith("mag-") ? "magazine" : "book";
    try {
      if (bookmarked) {
        await api.removeBookmark(String(book.id));
        setBookmarked(false);
      } else {
        await api.addBookmark({
          post_id: String(book.id),
          title: book.title,
          image: book.image || book.hero_image || null,
          category: book.author || null,
          type: kind,
        });
        setBookmarked(true);
      }
    } catch {}
  }, [book, bookmarked, user]);

  const onToggleComplete = useCallback(async () => {
    if (!book) return;
    if (!user) { router.push("/(auth)/login"); return; }
    const kind = String(book.id).startsWith("mag-") ? "magazine" : "book";
    const idStr = String(book.id);
    try {
      if (isComplete(idStr)) {
        await unmarkComplete(idStr);
      } else {
        await markComplete({
          post_id: idStr,
          title: book.title,
          image: book.image || book.hero_image || null,
          category: book.author || null,
          type: kind,
        });
      }
    } catch {}
  }, [book, user, isComplete, markComplete, unmarkComplete]);

  if (!book) return <View style={styles.root}><CenteredLoader /></View>;

  const grad = (book.cover_gradient && book.cover_gradient.length >= 2 ? book.cover_gradient : ["#4B3166", "#7A5B99"]) as any;
  const canRead = !!book.pdf_url;
  const pct = progress && progress.total_pages > 0 ? progress.page / progress.total_pages : 0;

  const onRead = () => router.push({ pathname: "/book/read/[id]", params: { id: String(book.id) } });
  const onShare = async () => {
    try { await Share.share({ message: `${book.title} — RetireMentorship`, title: book.title }); } catch {}
  };
  const onTalk = () => Linking.openURL(CALENDLY_URL).catch(() => {});

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        <View style={styles.headerBg}>
          {book.hero_image ? (
            <Image source={{ uri: book.hero_image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={300} />
          ) : (
            <LinearGradient colors={grad} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          )}
          <LinearGradient
            colors={book.hero_image ? ["rgba(0,0,0,0.35)", "rgba(0,0,0,0.05)", "rgba(35,31,32,0.55)"] : ["rgba(0,0,0,0)", "rgba(0,0,0,0)"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView edges={["top"]} style={styles.topBar}>
            <Pressable testID="book-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable testID="book-bookmark" onPress={toggleBookmark} style={styles.iconBtn} hitSlop={12}>
              <Ionicons
                name={bookmarked ? "bookmark" : "bookmark-outline"}
                size={20}
                color={bookmarked ? "#F0C673" : "#FFF"}
              />
            </Pressable>
            <Pressable testID="book-share" onPress={onShare} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="share-outline" size={20} color="#FFF" />
            </Pressable>
          </SafeAreaView>
          <View style={styles.coverWrap}>
            <BookCover book={book} width={200} height={286} onPress={onRead} progress={pct} />
          </View>
        </View>

        <View style={styles.body}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
            <GoldPill label={String(book.id).startsWith("mag-") ? "Magazine" : "Book"} testID="book-badge" />
            {isComplete(String(book.id)) ? <CompletePill testID="book-complete-pill" /> : null}
          </View>
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
            {book.pages ? (
              <View style={styles.metaChip}>
                <Ionicons name="document-text-outline" size={16} color={colors.brandSecondary} />
                <Text style={styles.metaChipText}>{book.pages} pages</Text>
              </View>
            ) : null}
            {book.reading_time ? (
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={16} color={colors.brandSecondary} />
                <Text style={styles.metaChipText}>{book.reading_time} min</Text>
              </View>
            ) : null}
            {progress && progress.total_pages > 0 ? (
              <View style={styles.metaChip}>
                <Ionicons name="bookmark" size={14} color={colors.brandSecondary} />
                <Text style={styles.metaChipText}>
                  {Math.round(pct * 100)}% • pg {progress.page}/{progress.total_pages}
                </Text>
              </View>
            ) : null}
            {downloaded?.ready ? (
              <View style={styles.metaChip}>
                <Ionicons name="cloud-done" size={14} color={colors.success} />
                <Text style={styles.metaChipText}>Offline · {formatBytes(downloaded.bytes)}</Text>
              </View>
            ) : null}
          </View>

          {book.excerpt ? <Text style={styles.excerpt}>{book.excerpt}</Text> : null}

          <View style={{ marginTop: spacing["2xl"], gap: spacing.md }}>
            {canRead ? (
              <PrimaryButton
                testID="book-start"
                label={progress?.page && progress.page > 1 ? `Continue on page ${progress.page}` : "Start reading"}
                onPress={onRead}
                icon="book"
              />
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
            <SecondaryButton
              testID="book-complete"
              label={isComplete(String(book.id)) ? "Marked complete — tap to undo" : "Mark as complete"}
              onPress={onToggleComplete}
              icon={isComplete(String(book.id)) ? "checkmark-done" : "checkmark-circle-outline"}
            />
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
  headerBg: { paddingBottom: spacing["3xl"], position: "relative", overflow: "hidden" },
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
