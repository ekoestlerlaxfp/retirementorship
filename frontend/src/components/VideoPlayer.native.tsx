// Native (iOS/Android/Expo Go) YouTube + Vimeo player.
//
// Uses a raw react-native-webview to embed youtube-nocookie.com. The WebView
// source has baseUrl set to https://www.youtube.com and the embed URL
// includes &origin=https://www.youtube.com so YouTube's player sees a
// consistent trusted origin (removes the "verify you're human" / consent
// prompts that appear when the origin is about:blank).

import React from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { radius } from "../theme";

type Props = {
  videoId: string;
  kind?: "youtube" | "vimeo";
  height?: number;
  width?: number;
  testID?: string;
  autoplay?: boolean;
};

const BASE_URL = "https://www.youtube.com";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

function youtubeHtml(videoId: string, autoplay: boolean) {
  const src =
    `https://www.youtube-nocookie.com/embed/${videoId}` +
    `?playsinline=1&modestbranding=1&rel=0&fs=1&iv_load_policy=3` +
    `&cc_load_policy=0&autoplay=${autoplay ? 1 : 0}` +
    `&origin=${encodeURIComponent(BASE_URL)}`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; }
      .wrap { position: absolute; inset: 0; }
      iframe { width: 100%; height: 100%; border: 0; display: block; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <iframe
        src="${src}"
        title="YouTube video player"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </div>
  </body>
</html>`;
}

function vimeoHtml(videoId: string, autoplay: boolean) {
  const src =
    `https://player.vimeo.com/video/${videoId}` +
    `?playsinline=1&autoplay=${autoplay ? 1 : 0}&dnt=1`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
      iframe { width: 100%; height: 100%; border: 0; display: block; }
    </style>
  </head>
  <body>
    <iframe
      src="${src}"
      title="Vimeo video player"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </body>
</html>`;
}

export function VideoPlayer({ videoId, kind = "youtube", height = 220, width, testID, autoplay = false }: Props) {
  const html = kind === "vimeo" ? vimeoHtml(videoId, autoplay) : youtubeHtml(videoId, autoplay);
  return (
    <View style={[styles.wrap, { height, width: width || "100%" }]} testID={testID}>
      <WebView
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={["*"]}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        userAgent={MOBILE_UA}
        style={styles.webview}
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
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
});
