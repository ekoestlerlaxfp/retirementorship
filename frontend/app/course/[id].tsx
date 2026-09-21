import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  RefreshControl,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { colors, radius, shadow, spacing, type as typo } from "@/src/theme";
import { api, type CourseT, type WPPost } from "@/src/api/client";
import { CenteredLoader, Muted } from "@/src/components/ui";
import { AdvisorCTA } from "@/src/components/AdvisorCTA";
import { useAuth } from "@/src/context/auth";
import { useCompleted } from "@/src/offline";

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const tagId = Number(id);
  const [course, setCourse] = useState<CourseT | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const { user } = useAuth();
  const { isComplete, markComplete, unmarkComplete } = useCompleted();

  const courseId = `course-${tagId}`;

  const load = useCallback(async () => {
    if (!tagId) return;
    try {
      const data = await api.course(tagId);
      setCourse(data);
    } catch {
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [tagId]);

  useEffect(() => {
    load();
  }, [load]);

  // Check bookmark state
  useEffect(() => {
    if (!user) return;
    api.bookmarkIds()
      .then((ids) => setBookmarked(ids.includes(courseId)))
      .catch(() => {});
  }, [user, courseId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const lessons = course?.lessons || [];
  const completedCount = useMemo(
    () => lessons.filter((l) => isComplete(l.id)).length,
    [lessons, isComplete]
  );
  const total = lessons.length;
  const pct = total ? completedCount / total : 0;
  const finished = total > 0 && completedCount === total;

  const toggleBookmark = useCallback(async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!course) return;
    try {
      if (bookmarked) {
        await api.removeBookmark(courseId);
        setBookmarked(false);
      } else {
        await api.addBookmark({
          post_id: courseId,
          title: course.title,
          image: course.image || null,
          category: "Course",
          type: "course",
        });
        setBookmarked(true);
      }
    } catch {
      // silent
    }
  }, [user, course, courseId, bookmarked]);

  const onShare = useCallback(async () => {
    if (!course) return;
    try {
      await Share.share({
        title: course.title,
        message: `${course.title} — a course on RetireMentorship`,
      });
    } catch {}
  }, [course]);

  const openLesson = (l: WPPost) => {
    router.push({ pathname: "/article/[id]", params: { id: String(l.id) } });
  };

  const toggleLessonComplete = async (l: WPPost) => {
    const pid = String(l.id);
    if (isComplete(pid)) {
      await unmarkComplete(pid);
    } else {
      try {
        await markComplete({
          post_id: pid,
          title: l.title,
          image: l.image || null,
          category: l.category?.name || null,
          type: l.type,
        });
      } catch {}
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={["top"]}>
          <BackBar onBack={() => router.back()} />
        </SafeAreaView>
        <CenteredLoader />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={["top"]}>
          <BackBar onBack={() => router.back()} />
        </SafeAreaView>
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Couldn&apos;t load this course</Text>
          <Muted style={{ textAlign: "center", marginTop: 4 }}>
            Please check your connection and try again.
          </Muted>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          {course.image ? (
            <Image source={{ uri: course.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          ) : (
            <LinearGradient
              colors={[colors.brandSecondary, "#6A4A8E"]}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.75)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
            <View style={styles.heroTopRow}>
              <Pressable
                testID="course-back"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  testID="course-share"
                  onPress={onShare}
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="share-outline" size={20} color="#FFF" />
                </Pressable>
                <Pressable
                  testID="course-bookmark"
                  onPress={toggleBookmark}
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={bookmarked ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={bookmarked ? colors.brandPrimary : "#FFF"}
                  />
                </Pressable>
              </View>
            </View>
            <View style={styles.heroFoot}>
              <View style={styles.coursePill}>
                <Ionicons name="school" size={12} color="#FFF" />
                <Text style={styles.coursePillText}>COURSE</Text>
                {finished ? (
                  <View style={styles.doneDot}>
                    <Ionicons name="checkmark" size={9} color="#FFF" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.heroTitle} numberOfLines={3}>{course.title}</Text>
              <Text style={styles.heroMeta}>
                {course.lesson_count} {course.lesson_count === 1 ? "lesson" : "lessons"}
                {total ? ` • ${completedCount}/${total} complete` : ""}
              </Text>
            </View>
          </SafeAreaView>
        </View>

        {/* Progress bar */}
        {total > 0 ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
                    backgroundColor: finished ? (colors.success || "#356646") : colors.brandPrimary,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {finished ? "🎉 Course complete" : `${Math.round(pct * 100)}% complete`}
            </Text>
          </View>
        ) : null}

        {/* Description */}
        {course.description ? (
          <View style={styles.descWrap}>
            <Text style={styles.aboutKicker}>ABOUT THIS COURSE</Text>
            <Text style={styles.descText}>{course.description}</Text>
          </View>
        ) : null}

        {/* Lessons */}
        <View style={styles.lessonsWrap}>
          <Text style={styles.aboutKicker}>LESSONS</Text>
          {lessons.length === 0 ? (
            <Muted style={{ marginTop: spacing.md }}>No lessons available.</Muted>
          ) : (
            lessons.map((l, idx) => {
              const done = isComplete(l.id);
              return (
                <View key={l.id} style={styles.lessonRow}>
                  <Pressable
                    testID={`lesson-open-${l.id}`}
                    onPress={() => openLesson(l)}
                    style={({ pressed }) => [
                      styles.lessonRowInner,
                      pressed && { transform: [{ scale: 0.99 }] },
                    ]}
                  >
                    <View style={styles.lessonNumWrap}>
                      {done ? (
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                      ) : (
                        <Text style={styles.lessonNum}>{idx + 1}</Text>
                      )}
                    </View>
                    <View style={styles.lessonThumb}>
                      {l.image ? (
                        <Image
                          source={{ uri: l.image }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <LinearGradient
                          colors={[colors.brandSecondary, "#6A4A8E"]}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      {l.type === "video" ? (
                        <View style={styles.playDot}>
                          <Ionicons name="play" size={12} color="#FFF" />
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flex: 1, minHeight: 66, justifyContent: "center" }}>
                      <Text style={styles.lessonTitle} numberOfLines={2}>{l.title}</Text>
                      <View style={styles.lessonMetaRow}>
                        <Ionicons
                          name={l.type === "video" ? "play-circle-outline" : "book-outline"}
                          size={12}
                          color={colors.muted}
                        />
                        <Text style={styles.lessonMeta}>
                          {l.type === "video" ? "Video" : "Article"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    testID={`lesson-toggle-${l.id}`}
                    onPress={() => toggleLessonComplete(l)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.lessonCheck,
                      done && styles.lessonCheckDone,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons
                      name={done ? "checkmark" : "ellipse-outline"}
                      size={18}
                      color={done ? "#FFF" : colors.brandSecondary}
                    />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xl }}>
          <AdvisorCTA />
        </View>
      </ScrollView>
    </View>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.backBar}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.iconBtnDark, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.brandSecondary} />
      </Pressable>
    </View>
  );
}

const HERO_HEIGHT = 320;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  heroFoot: {
    marginTop: "auto",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  coursePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.42)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: spacing.sm,
  },
  coursePillText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  doneDot: {
    marginLeft: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success || "#356646",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: "#FFF",
    fontSize: typo.sizes["2xl"],
    lineHeight: typo.sizes["2xl"] * 1.1,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  heroMeta: {
    marginTop: spacing.sm,
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  progressWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 4,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", borderRadius: 3 },
  progressText: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.brandSecondary,
    letterSpacing: 0.3,
  },
  descWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  aboutKicker: {
    color: colors.brandPrimary,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.4,
  },
  descText: {
    marginTop: spacing.sm,
    fontSize: typo.sizes.base,
    lineHeight: typo.sizes.base * 1.5,
    color: colors.onSurface,
  },
  lessonsWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  lessonRowInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  lessonNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonNum: {
    color: colors.brandSecondary,
    fontWeight: "800",
    fontSize: 13,
  },
  lessonThumb: {
    width: 76,
    height: 66,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  playDot: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateX: -13 }, { translateY: -13 }],
  },
  lessonTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  lessonMetaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lessonMeta: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  lessonCheck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonCheckDone: {
    backgroundColor: colors.success || "#356646",
    borderColor: colors.success || "#356646",
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  errorTitle: {
    marginTop: spacing.md,
    fontSize: 17,
    fontWeight: "800",
    color: colors.onSurface,
    textAlign: "center",
  },
});
