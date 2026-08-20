import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { cachedApi, type BookT, type MagazineT, type WPPost } from "@/src/api/client";
import { BookCover, MagazineCover } from "@/src/components/BookCover";
import { H1, Muted, GoldPill } from "@/src/components/ui";
import { bookProgress, type BookProgress } from "@/src/offline";

type Section = "books" | "magazines" | "videos";

export default function Learn() {
  const [tab, setTab] = useState<Section>("books");
  const [books, setBooks] = useState<BookT[] | null>(null);
  const [mags, setMags] = useState<MagazineT[] | null>(null);
  const [videos, setVideos] = useState<WPPost[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bookProg, setBookProg] = useState<Record<string, BookProgress>>({});

  const loadProgress = useCallback(async () => {
    const list = await bookProgress.list();
    const map: Record<string, BookProgress> = {};
    list.forEach((p) => { map[p.book_id] = p; });
    setBookProg(map);
  }, []);

  const load = useCallback(async () => {
    cachedApi.books({
      onCache: (d) => { if (d) setBooks(d); },
      onFresh: (d) => setBooks(d),
    }).then((d) => { if (d && books === null) setBooks(d); }).catch(() => setBooks([]));
    cachedApi.magazines({
      onCache: (d) => { if (d) setMags(d); },
      onFresh: (d) => setMags(d),
    }).then((d) => { if (d && mags === null) setMags(d); }).catch(() => setMags([]));
    cachedApi.videos({
      onCache: (d) => { if (d) setVideos(d); },
      onFresh: (d) => setVideos(d),
    }).then((d) => { if (d && videos === null) setVideos(d); }).catch(() => setVideos([]));
    // Book progress + server sync
    loadProgress();
    bookProgress.syncFromServer().then(() => loadProgress()).catch(() => {});
    bookProgress.pushDirty().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }, [load]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>THE LIBRARY</Text>
          <H1 style={{ marginTop: 4 }}>Learn</H1>
          <Muted style={{ marginTop: spacing.sm }}>
            Books, magazines, and videos — curated by educators, not sales teams.
          </Muted>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={{ flexGrow: 0 }}
        >
          {([
            { id: "books", label: "Bookshelf", icon: "book" as const, count: books?.length ?? 0 },
            { id: "magazines", label: "Magazines", icon: "newspaper" as const, count: mags?.length ?? 0 },
            { id: "videos", label: "Videos", icon: "play-circle" as const, count: videos?.length ?? 0 },
          ] as { id: Section; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[]).map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                testID={`learn-tab-${t.id}`}
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
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {tab === "books" && <BooksSection books={books} progressMap={bookProg} />}
        {tab === "magazines" && <MagazinesSection mags={mags} />}
        {tab === "videos" && <VideosSection videos={videos} />}
      </ScrollView>
    </View>
  );
}

function BooksSection({ books, progressMap }: { books: BookT[] | null; progressMap: Record<string, BookProgress> }) {
  if (!books) return null;
  if (!books.length) {
    return <ComingSoon icon="book-outline" title="No books yet" subtitle="The bookshelf will fill up as we publish." />;
  }
  return (
    <View style={styles.grid}>
      {books.map((b) => {
        const p = progressMap[String(b.id)];
        const pct = p && p.total_pages > 0 ? p.page / p.total_pages : 0;
        return (
          <View key={String(b.id)} style={styles.gridCell}>
            <BookCover book={b} width={166} height={244} progress={pct} />
            <Text style={styles.cellTitle} numberOfLines={2}>{b.title}</Text>
            {p && p.total_pages > 0 ? (
              <Text style={styles.progressMeta}>
                {Math.round(pct * 100)}% • pg {p.page}/{p.total_pages}
              </Text>
            ) : (
              b.subtitle ? <Text style={styles.cellSub} numberOfLines={2}>{b.subtitle}</Text> : null
            )}
          </View>
        );
      })}
    </View>
  );
}

function MagazinesSection({ mags }: { mags: MagazineT[] | null }) {
  if (!mags) return null;
  if (!mags.length) {
    return (
      <View style={{ paddingHorizontal: spacing.xl }}>
        <ComingSoon
          icon="newspaper-outline"
          title="Magazines coming soon"
          subtitle="Beautifully curated semi-annual issues will land here."
        />
        <View style={styles.mockShelf}>
          <MockMagazine title="ISSUE 01" tagline="Living the retirement you designed" />
          <MockMagazine title="ISSUE 02" tagline="The tax-smart playbook" alt />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      {mags.map((m) => (
        <View key={String(m.id)} style={styles.gridCell}>
          <MagazineCover mag={m} width={166} height={220} />
          <Text style={styles.cellTitle} numberOfLines={2}>{m.title}</Text>
        </View>
      ))}
    </View>
  );
}

function VideosSection({ videos }: { videos: WPPost[] | null }) {
  if (!videos) return null;
  if (!videos.length) {
    return <ComingSoon icon="play-circle-outline" title="No videos yet" subtitle="Video lessons will appear here." />;
  }
  return (
    <View style={styles.videoList}>
      {videos.map((v) => (
        <Pressable
          key={v.id}
          testID={`learn-video-${v.id}`}
          onPress={() => router.push({ pathname: "/article/[id]", params: { id: String(v.id) } })}
          style={({ pressed }) => [styles.videoRow, pressed && { transform: [{ scale: 0.985 }] }]}
        >
          <View style={styles.videoRowThumb}>
            {v.image ? (
              <Image source={{ uri: v.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
            ) : (
              <LinearGradient colors={[colors.brandSecondary, "#3A2452"]} style={StyleSheet.absoluteFillObject} />
            )}
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.playBadge}>
              <Ionicons name="play" size={22} color="#FFF" />
            </View>
          </View>
          <View style={{ paddingHorizontal: 4, paddingTop: spacing.md }}>
            {v.category ? <Text style={styles.videoCat}>{v.category.name.toUpperCase()}</Text> : null}
            <Text style={styles.videoRowTitle} numberOfLines={3}>{v.title}</Text>
            {v.excerpt ? <Text style={styles.videoRowExcerpt} numberOfLines={2}>{v.excerpt}</Text> : null}
            <View style={styles.videoRowMeta}>
              <Ionicons name="play-circle" size={14} color={colors.brandSecondary} />
              <Text style={styles.videoRowMetaText}>Watch now · {v.reading_time || 1} min</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ComingSoon({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={styles.comingWrap}>
      <View style={styles.comingIcon}>
        <Ionicons name={icon} size={28} color={colors.brandPrimary} />
      </View>
      <Text style={styles.comingTitle}>{title}</Text>
      {subtitle ? <Muted style={{ textAlign: "center", marginTop: spacing.sm }}>{subtitle}</Muted> : null}
    </View>
  );
}

function MockMagazine({ title, tagline, alt = false }: { title: string; tagline: string; alt?: boolean }) {
  return (
    <View style={styles.mockCover}>
      <LinearGradient
        colors={alt ? ["#B0793A", "#C5A059"] : [colors.brandSecondary, "#6A4A8E"]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.mockStamp}>
        <Ionicons name="newspaper" size={12} color="#FFF" />
        <Text style={styles.mockStampText}>{title}</Text>
      </View>
      <View style={{ position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md }}>
        <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "800", letterSpacing: -0.2 }} numberOfLines={2}>
          {tagline}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.4 },
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    rowGap: spacing.xl,
    justifyContent: "space-between",
  },
  gridCell: { width: "48%" },
  videoList: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.xl },
  videoRow: { width: "100%" },
  videoRowThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    ...shadow.card,
  },
  videoRowTitle: {
    marginTop: 4,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  videoRowExcerpt: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.muted },
  videoRowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  videoRowMetaText: { color: colors.brandSecondary, fontSize: 13, fontWeight: "700" },
  playBadge: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(75,49,102,0.92)",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateX: -24 }, { translateY: -24 }],
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  videoCat: {
    color: colors.brandPrimary,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  cellTitle: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  cellSub: { marginTop: 4, fontSize: 13, color: colors.muted, lineHeight: 18 },
  progressMeta: { marginTop: 4, fontSize: 12, color: colors.brandSecondary, fontWeight: "700", letterSpacing: 0.2 },
  videoMeta: { marginTop: 4, fontSize: 13, color: colors.muted, fontWeight: "500" },
  comingWrap: {
    alignItems: "center",
    paddingTop: spacing["2xl"],
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  comingIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
  comingTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, textAlign: "center", letterSpacing: -0.3 },
  mockShelf: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  mockCover: {
    flex: 1,
    aspectRatio: 4 / 5,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadow.card,
  },
  mockStamp: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  mockStampText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});
