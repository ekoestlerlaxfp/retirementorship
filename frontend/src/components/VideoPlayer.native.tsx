// Native (iOS/Android/Expo Go) YouTube + Vimeo player.
// Uses react-native-youtube-iframe (react-native-webview under the hood)
// which fixes the "Error 153" that raw <iframe src=youtube.com/embed> URLs
// hit when opened directly on a mobile WebView origin.

import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { WebView } from "react-native-webview";
import { colors, radius } from "../theme";

type Props = {
  videoId: string;
  kind?: "youtube" | "vimeo";
  height?: number;
  width?: number;
  testID?: string;
  autoplay?: boolean;
};

export function VideoPlayer({ videoId, kind = "youtube", height = 220, width, testID, autoplay = false }: Props) {
  const [ready, setReady] = useState(false);
  const containerStyle = [styles.wrap, { height, width: width || "100%" }];

  if (kind === "vimeo") {
    return (
      <View style={containerStyle} testID={testID}>
        <WebView
          source={{ uri: `https://player.vimeo.com/video/${videoId}?playsinline=1` }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          style={{ height, width: "100%", backgroundColor: "#000" }}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle} testID={testID}>
      {!ready ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : null}
      <YoutubePlayer
        height={height}
        videoId={videoId}
        play={autoplay}
        onReady={() => setReady(true)}
        webViewProps={{
          allowsFullscreenVideo: true,
          allowsInlineMediaPlayback: true,
          mediaPlaybackRequiresUserAction: false,
          androidLayerType: "hardware",
        }}
        initialPlayerParams={{
          modestbranding: true,
          rel: false,
          preventFullScreen: false,
          controls: true,
          cc_lang_pref: "en",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
});
