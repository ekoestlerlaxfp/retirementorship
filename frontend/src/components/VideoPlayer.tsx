// RetireMentorship — YouTube/Vimeo "external launcher" card.
//
// Rather than embedding a WebView player (which keeps hitting bot/consent
// screens on YouTube), we render a poster + big Play button. Tapping it
// hands off to the YouTube (or Vimeo) app on the user's phone via
// Linking.openURL, or opens the video page in the browser as a fallback.
//
// Works identically on iOS, Android, Expo Go, and web — so a single file
// replaces the previous .tsx + .native.tsx split.

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking, Platform } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow } from "../theme";

type Props = {
  videoId: string;
  kind?: "youtube" | "vimeo";
  height?: number;
  width?: number;
  testID?: string;
  /** unused — kept so callers don't need to change */
  autoplay?: boolean;
};

function youtubeWebUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

function youtubeAppUrl(id: string) {
  return `vnd.youtube://${id}`;
}

function vimeoWebUrl(id: string) {
  return `https://vimeo.com/${id}`;
}

async function openVideoExternally(kind: "youtube" | "vimeo", id: string) {
  const webUrl = kind === "youtube" ? youtubeWebUrl(id) : vimeoWebUrl(id);
  // On web, just open the tab.
  if (Platform.OS === "web") {
    try { (globalThis as any).open?.(webUrl, "_blank"); } catch { await Linking.openURL(webUrl); }
    return;
  }
  // On native, try the app URL first so the YouTube app takes over.
  if (kind === "youtube") {
    const appUrl = youtubeAppUrl(id);
    try {
      const can = await Linking.canOpenURL(appUrl);
      if (can) { await Linking.openURL(appUrl); return; }
    } catch { /* fall through */ }
  }
  await Linking.openURL(webUrl);
}

export function VideoPlayer({ videoId, kind = "youtube", height = 220, width, testID }: Props) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const poster =
    kind === "youtube"
      ? (thumbFailed
          ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
          : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`)
      : null;

  const onPress = useCallback(() => {
    openVideoExternally(kind, videoId).catch(() => {});
  }, [kind, videoId]);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        { height, width: width || "100%" },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Play ${kind === "youtube" ? "YouTube" : "Vimeo"} video`}
    >
      {poster ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallbackBg]} />
      )}
      <View style={styles.dim} pointerEvents="none" />

      <View style={styles.playBtn}>
        <Ionicons name="play" size={30} color={colors.brandPrimary} />
      </View>

      <View style={styles.footer} pointerEvents="none">
        <Ionicons
          name={kind === "youtube" ? "logo-youtube" : "videocam"}
          size={16}
          color="#FFF"
        />
        <Text style={styles.footerText}>
          {kind === "youtube" ? "Watch on YouTube" : "Watch on Vimeo"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  fallbackBg: { backgroundColor: "#1A1225" },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,253,250,0.95)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  footer: {
    position: "absolute",
    left: 16,
    bottom: 14,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.4,
  },
});
