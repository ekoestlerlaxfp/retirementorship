// Cross-platform WebView wrapper.
// - Native: react-native-webview
// - Web (Expo web/preview): raw <iframe>
// Optionally accepts inline `html` (with the ReactNativeWebView.postMessage → parent.postMessage
// bridge patched in for iframes), OR a remote `uri`.

import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, ViewStyle } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";

type Common = {
  onMessage?: (evt: WebViewMessageEvent) => void;
  style?: ViewStyle;
  testID?: string;
  allowFullscreen?: boolean;
};

type Props = Common & (
  | { html: string; uri?: undefined }
  | { uri: string; html?: undefined }
);

export function CrossWebView({ html, uri, onMessage, style, testID, allowFullscreen }: Props) {
  if (Platform.OS === "web") {
    return <WebIframe html={html} uri={uri} onMessage={onMessage} style={style} testID={testID} allowFullscreen={allowFullscreen} />;
  }
  return (
    <WebView
      testID={testID}
      source={html ? { html, baseUrl: "https://retirementorship.com/" } : { uri: uri! }}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      onMessage={onMessage}
      style={[styles.web, style]}
      androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
    />
  );
}

function WebIframe({ html, uri, onMessage, style, testID, allowFullscreen }: Props) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (!onMessage) return;
    const listener = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "string") return;
      try {
        JSON.parse(e.data);
        onMessage({ nativeEvent: { data: e.data } } as any);
      } catch {}
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onMessage]);
  const patched = html
    ? html.replace(
        "window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg))",
        "window.parent.postMessage(JSON.stringify(msg), '*')"
      )
    : undefined;
  return React.createElement("iframe", {
    ref,
    "data-testid": testID,
    ...(patched ? { srcDoc: patched } : { src: uri }),
    style: {
      flex: 1,
      border: 0,
      backgroundColor: "#000",
      width: "100%",
      height: "100%",
      ...(style as any),
    },
    sandbox: "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups",
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    allowFullScreen: !!allowFullscreen,
  });
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "#000" },
});
