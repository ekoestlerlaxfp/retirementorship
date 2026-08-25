// Web-only YouTube + Vimeo player. Metro auto-selects VideoPlayer.native.tsx
// on iOS/Android and this file on web. Keeping the web branch dependency-free
// prevents Metro from walking into react-native-youtube-iframe's web variant
// which pulls in the missing `react-native-web-webview` package.

import React from "react";
import { View, StyleSheet } from "react-native";
import { radius } from "../theme";

type Props = {
  videoId: string;
  kind?: "youtube" | "vimeo";
  height?: number;
  width?: number;
  testID?: string;
  autoplay?: boolean;
};

export function VideoPlayer({ videoId, kind = "youtube", height = 220, width, testID, autoplay = false }: Props) {
  const src =
    kind === "vimeo"
      ? `https://player.vimeo.com/video/${videoId}?playsinline=1${autoplay ? "&autoplay=1" : ""}`
      : `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&modestbranding=1&rel=0${autoplay ? "&autoplay=1" : ""}`;
  return (
    <View style={[styles.wrap, { height, width: width || "100%" }]} testID={testID}>
      {React.createElement("iframe", {
        src,
        style: { border: 0, width: "100%", height: "100%", borderRadius: 12 },
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        allowFullScreen: true,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
  },
});
