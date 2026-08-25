// Native (iOS/Android/Expo Go) YouTube + Vimeo player.
//
// Uses `react-native-youtube-iframe`, which wraps YouTube's official IFrame
// Player API in a react-native-webview. This is the officially recommended
// approach for Expo apps because it uses YouTube's own JavaScript API rather
// than a raw embed URL — so it doesn't trigger the web-based bot verification
// / cookie consent screens users see when opening an embed URL directly.
//
// Anti-bot config that is critical:
//  - `originWhitelist: ["*"]` on the WebView, plus a modern mobile user agent
//  - `mediaPlaybackRequiresUserAction: false` so tapping play works first try
//  - `androidLayerType: "hardware"` for smooth Android playback
//  - `initialPlayerParams` with `modestbranding` + `rel: false` + `controls: true`

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

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

export function VideoPlayer({ videoId, kind = "youtube", height = 220, width, testID, autoplay = false }: Props) {
  const [ready, setReady] = useState(false);
  const containerStyle = [styles.wrap, { height, width: width || "100%" }];

  if (kind === "vimeo") {
    return (
      <View style={containerStyle} testID={testID}>
        <WebView
          source={{ uri: `https://player.vimeo.com/video/${videoId}?playsinline=1&dnt=1` }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          userAgent={MOBILE_UA}
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
          javaScriptEnabled: true,
          domStorageEnabled: true,
          thirdPartyCookiesEnabled: true,
          androidLayerType: "hardware",
          originWhitelist: ["*"],
          userAgent: MOBILE_UA,
        }}
        initialPlayerParams={{
          modestbranding: true,
          rel: false,
          preventFullScreen: false,
          controls: true,
          cc_lang_pref: "en",
          iv_load_policy: 3,
          playsinline: true,
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
