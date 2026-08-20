import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, useWindowDimensions, Share, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import WebView from "react-native-webview";
import RenderHtml from "react-native-render-html";
import { colors, spacing, radius, type as typo } from "@/src/theme";
import { api, cachedApi, WPPost } from "@/src/api/client";
import { CenteredLoader, CompletePill, GoldPill, Muted } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { CrossWebView } from "@/src/components/CrossWebView";
import { useAuth } from "@/src/context/auth";
import { progress as progressStore, downloads, useCompleted } from "@/src/offline";

function extractYoutubeId(html: string): string | null {
  const m1 = html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m1) return m1[1];
  const m2 = html.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m2) return m2[1];
  const m3 = html.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/);
  if (m3) return m3[1];
  return null;
}

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<WPPost | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const { user } = useAuth();
  const { isComplete, markComplete, unmarkComplete } = useCompleted();
  const lastProgressSaved = useRef(0);

  useEffect(() => {
    if (!id) return;
    const pid = Number(id);
    cachedApi.post(pid, {
      onCache: (cached) => {
        if (cached) { setPost(cached); setFromCache(true); }
      },
      onFresh: (fresh) => { setPost(fresh); setFromCache(false); },
    }).then((p) => {
      if (!p) return;
      // Seed reading progress + history
      progressStore.set({
        post_id: p.id,
        progress: 0.05,
        title: p.title,
        image: p.image,
        category: p.category?.name,
        type: p.type,
      });
      downloads.get(`article-${p.id}`).then((d) => setDownloaded(!!d));
      if (user) {
        api.addHistory({
          post_id: String(p.id), title: p.title, image: p.image, category: p.category?.name, type: p.type, progress: 0.05,
        }).catch(() => {});
        api.bookmarkIds().then((ids) => setBookmarked(ids.includes(String(p.id)))).catch(() => {});
      }
    });
  }, [id, user]);

  const youtubeId = useMemo(() => post ? extractYoutubeId(post.content_html) : null, [post]);

  const toggleBookmark = useCallback(async () => {
    if (!post) return;
    if (!user) { router.push("/(auth)/login"); return; }
    try {
      if (bookmarked) { await api.removeBookmark(String(post.id)); setBookmarked(false); }
      else {
        await api.addBookmark({
          post_id: String(post.id), title: post.title, image: post.image, category: post.category?.name, type: post.type,
        });
        setBookmarked(true);
      }
    } catch {}
  }, [post, bookmarked, user]);

  const onShare = useCallback(async () => {
    if (!post) return;
    try { await Share.share({ message: `${post.title} — ${post.link}`, url: post.link, title: post.title }); } catch {}
  }, [post]);

  const toggleComplete = useCallback(async () => {
    if (!post) return;
    if (!user) { router.push("/(auth)/login"); return; }
    const idStr = String(post.id);
    try {
      if (isComplete(idStr)) {
        await unmarkComplete(idStr);
      } else {
        await markComplete({
          post_id: idStr, title: post.title, image: post.image,
          category: post.category?.name, type: post.type,
        });
      }
    } catch {}
  }, [post, user, isComplete, markComplete, unmarkComplete]);

  const toggleOffline = useCallback(async () => {
    if (!post) return;
    const id = `article-${post.id}`;
    if (downloaded) {
      await downloads.remove(id);
      setDownloaded(false);
      return;
    }
    // Article JSON is already in the cache. If a cover exists, persist it via expo-file-system.
    if (post.image) {
      await downloads.start({
        id,
        kind: "article",
        post_id: post.id,
        title: post.title,
        cover: post.image,
        remote_url: post.image,
        version: post.modified || null,
      });
    } else {
      // No binary — mark as ready with no local file
      await downloads.start({
        id,
        kind: "article",
        post_id: post.id,
        title: post.title,
        cover: null,
        remote_url: post.link,
        version: post.modified || null,
      });
    }
    setDownloaded(true);
  }, [post, downloaded]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!post) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const denom = Math.max(1, contentSize.height - layoutMeasurement.height);
    const p = Math.min(1, Math.max(0, contentOffset.y / denom));
    const now = Date.now();
    if (now - lastProgressSaved.current < 1500) return; // throttle
    lastProgressSaved.current = now;
    progressStore.set({
      post_id: post.id, progress: p, title: post.title, image: post.image,
      category: post.category?.name, type: post.type,
    });
    if (user) {
      api.addHistory({
        post_id: String(post.id), title: post.title, image: post.image, category: post.category?.name, type: post.type, progress: p,
      }).catch(() => {});
    }
  }, [post, user]);

  const htmlSource = useMemo(() => {
    if (!post) return { html: "" };
    let html = post.content_html;
    html = html.replace(/<figure[^>]*wp-block-embed[^>]*>[\s\S]*?<\/figure>/gi, "");
    html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
    return { html };
  }, [post]);

  if (!post) return <View style={styles.root}><CenteredLoader /></View>;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.topBar}>
        <Pressable testID="article-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable testID="article-offline" onPress={toggleOffline} style={styles.iconBtn} hitSlop={12}>
          <Ionicons
            name={downloaded ? "cloud-done" : "cloud-download-outline"}
            size={20}
            color={downloaded ? colors.brandPrimary : colors.onSurface}
          />
        </Pressable>
        <Pressable testID="article-share" onPress={onShare} style={styles.iconBtn} hitSlop={12}>
          <Ionicons name="share-outline" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="article-complete" onPress={toggleComplete} style={styles.iconBtn} hitSlop={12}>
          <Ionicons
            name={post && isComplete(String(post.id)) ? "checkmark-done-circle" : "checkmark-circle-outline"}
            size={22}
            color={post && isComplete(String(post.id)) ? (colors.success || "#2E7D5B") : colors.onSurface}
          />
        </Pressable>
        <Pressable testID="article-bookmark" onPress={toggleBookmark} style={styles.iconBtn} hitSlop={12}>
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={22}
            color={bookmarked ? colors.brandPrimary : colors.onSurface}
          />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing["3xl"] }}
        onScroll={onScroll}
        scrollEventThrottle={200}
      >
        {youtubeId ? (
          <View style={[styles.videoWrap, { marginTop: insets.top + 72 }]}>
            <CrossWebView
              testID="article-video"
              uri={`https://www.youtube.com/embed/${youtubeId}?playsinline=1&modestbranding=1&rel=0`}
              allowFullscreen
              style={styles.video as any}
            />
          </View>
        ) : post.image ? (
          <View style={styles.heroImgWrap}>
            <Image source={{ uri: post.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
            <LinearGradient colors={["transparent", "rgba(35,31,32,0.4)"]} style={StyleSheet.absoluteFillObject} />
          </View>
        ) : null}

        <View style={styles.body}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
            {post.category && <GoldPill label={post.category.name} testID="article-category" />}
            {isComplete(String(post.id)) ? <CompletePill testID="article-complete-pill" /> : null}
            {fromCache && (
              <View style={styles.offlinePill} testID="article-offline-pill">
                <Ionicons name="cloud-offline-outline" size={12} color={colors.brandSecondary} />
                <Text style={styles.offlinePillText}>Saved offline</Text>
              </View>
            )}
          </View>
          <Text style={styles.title} testID="article-title">{post.title}</Text>
          <View style={styles.metaRow}>
            {post.type !== "video" ? (
              <>
                <Ionicons name="time-outline" size={16} color={colors.muted} />
                <Text style={styles.meta}>{post.reading_time} min read</Text>
                <View style={styles.dot} />
              </>
            ) : (
              <>
                <Ionicons name="play-circle-outline" size={16} color={colors.muted} />
                <Text style={styles.meta}>Video</Text>
                <View style={styles.dot} />
              </>
            )}
            <Text style={styles.meta}>{new Date(post.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
          </View>

          {post.excerpt ? <Text style={styles.excerpt}>{post.excerpt}</Text> : null}

          <View style={styles.divider} />

          <RenderHtml
            contentWidth={width - spacing.xl * 2}
            source={htmlSource}
            baseStyle={{ fontSize: typo.sizes.base, lineHeight: 28, color: colors.onSurface }}
            tagsStyles={{
              p: { marginBottom: spacing.lg, fontSize: 17, lineHeight: 28, color: colors.onSurface },
              h1: { fontSize: 28, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.md, color: colors.onSurface },
              h2: { fontSize: 22, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.md, color: colors.onSurface },
              h3: { fontSize: 19, fontWeight: "700", marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.onSurface },
              a: { color: colors.brandSecondary, textDecorationLine: "underline" },
              li: { fontSize: 17, lineHeight: 28, color: colors.onSurface, marginBottom: spacing.sm },
              blockquote: {
                borderLeftWidth: 4, borderLeftColor: colors.brandPrimary,
                paddingLeft: spacing.lg, marginVertical: spacing.lg,
                fontStyle: "italic",
              },
              img: { borderRadius: radius.md, marginVertical: spacing.md },
              strong: { fontWeight: "800" },
            }}
            defaultTextProps={{ selectable: true }}
          />
        </View>

        <View style={{ marginTop: spacing["2xl"] }}>
          <AdvisorCTA compact testID="article-advisor-cta" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  videoWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  video: { flex: 1, backgroundColor: "#000" },
  heroImgWrap: { width: "100%", height: 320, backgroundColor: colors.surfaceTertiary, marginTop: 0 },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing["2xl"] },
  title: {
    fontSize: 32, lineHeight: 40, fontWeight: "800",
    color: colors.onSurface, letterSpacing: -0.5, marginTop: spacing.md,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  meta: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.muted, marginHorizontal: 6 },
  excerpt: {
    fontSize: 19, lineHeight: 28, color: colors.onSurface,
    fontStyle: "italic", opacity: 0.85, marginTop: spacing.lg,
  },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xl },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlinePillText: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
});
