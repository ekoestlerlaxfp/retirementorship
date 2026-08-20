import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { colors, radius, spacing } from "@/src/theme";
import { api, cachedApi, type BookT } from "@/src/api/client";
import { CenteredLoader } from "@/src/components/ui";
import { bookProgress, downloads } from "@/src/offline";

// Minimal PDF.js reader. Uses the ES-module build so we can render pages onto
// canvases in one long scroll and detect the current page via IntersectionObserver.
function buildHtml(pdfUrl: string, startPage: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=3.0">
<style>
  html, body { margin:0; padding:0; background:#231F20; color:#fff; -webkit-user-select:none; }
  #topbar { position: sticky; top: 0; z-index: 3; background: rgba(35,31,32,0.94); padding: 10px 14px; display:flex; align-items:center; justify-content:space-between; border-bottom: 0.5px solid rgba(255,255,255,0.08); }
  #pages { display:flex; flex-direction:column; align-items:center; padding: 12px 0 96px; gap: 14px; }
  canvas { max-width: 100%; height: auto; background:#fff; box-shadow: 0 8px 24px rgba(0,0,0,0.55); border-radius: 8px; }
  #status { font-size: 13px; font-weight: 700; letter-spacing: 0.4px; color:#F0E6D2; }
  #progress { height: 3px; background: #C5A059; width: 0%; transition: width 200ms ease; border-radius: 2px; margin-top: 6px; }
  #loading { color: #F0E6D2; text-align:center; padding: 48px 24px; font-size: 15px; }
  .err { color:#F5C4C4; text-align:center; padding: 48px 24px; font-size: 15px; }
</style>
</head>
<body>
<div id="topbar">
  <div>
    <div id="status">Loading…</div>
    <div id="progress"></div>
  </div>
</div>
<div id="loading">Preparing your book…</div>
<div id="pages"></div>
<script type="module">
  import * as pdfjs from "https://esm.sh/pdfjs-dist@4.5.136/build/pdf.min.mjs";
  pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
  const PDF_URL = ${JSON.stringify(pdfUrl)};
  const START_PAGE = ${JSON.stringify(startPage)};
  const post = (msg) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch(e){} };

  async function render() {
    try {
      const loading = document.getElementById('loading');
      const container = document.getElementById('pages');
      const status = document.getElementById('status');
      const progress = document.getElementById('progress');
      const task = pdfjs.getDocument({ url: PDF_URL, disableRange: true, disableStream: true });
      const doc = await task.promise;
      loading.remove();
      const total = doc.numPages;
      let current = Math.max(1, Math.min(total, START_PAGE));
      status.textContent = 'Page ' + current + ' of ' + total;
      progress.style.width = ((current / total) * 100) + '%';
      post({ type: 'ready', total });

      const scale = Math.min(2, Math.max(1.2, (window.innerWidth - 24) / 612));
      for (let i = 1; i <= total; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.dataset.page = i;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        container.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }

      const canvases = container.querySelectorAll('canvas');
      const obs = new IntersectionObserver((entries) => {
        // Take the entry with largest ratio
        let best = { r: 0, p: current };
        entries.forEach(e => {
          if (e.intersectionRatio > best.r) {
            best = { r: e.intersectionRatio, p: parseInt(e.target.dataset.page, 10) };
          }
        });
        if (best.r > 0.4 && best.p !== current) {
          current = best.p;
          status.textContent = 'Page ' + current + ' of ' + total;
          progress.style.width = ((current / total) * 100) + '%';
          post({ type: 'page', page: current, total });
        }
      }, { threshold: [0.4, 0.6, 0.8] });
      canvases.forEach(c => obs.observe(c));

      if (START_PAGE > 1 && canvases[START_PAGE - 1]) {
        setTimeout(() => canvases[START_PAGE - 1].scrollIntoView({ behavior: 'instant', block: 'start' }), 250);
      }
    } catch (e) {
      const l = document.getElementById('loading');
      if (l) { l.className = 'err'; l.textContent = 'Could not open this book. Please check your connection and try again.'; }
      post({ type: 'error', message: String(e && e.message || e) });
    }
  }
  render();
</script>
</body>
</html>`;
}

export default function BookReader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [book, setBook] = useState<BookT | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState(1);
  const [total, setTotal] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [downloadedFrac, setDownloadedFrac] = useState(0);
  const lastSave = useRef(0);

  // Fetch book meta + starting page
  useEffect(() => {
    if (!id) return;
    (async () => {
      const b = await api.book(id).catch(() => null);
      if (!b) return;
      setBook(b);
      const p = await bookProgress.get(String(b.id));
      if (p?.page) setStartPage(p.page);
      // If already downloaded, use local file
      const dl = await downloads.get(String(b.id));
      if (dl?.status === "ready" && dl.local_uri) setLocalUri(dl.local_uri);
    })();
  }, [id]);

  // Ensure we sync any pending progress on mount
  useEffect(() => {
    bookProgress.pushDirty().catch(() => {});
    bookProgress.syncFromServer().catch(() => {});
  }, []);

  const pdfUrl = useMemo(() => {
    if (!book) return null;
    // Prefer local file when we have it (offline reads)
    return localUri || book.pdf_url || null;
  }, [book, localUri]);

  const html = useMemo(() => (pdfUrl ? buildHtml(pdfUrl, startPage) : null), [pdfUrl, startPage]);

  const onMessage = useCallback((evt: WebViewMessageEvent) => {
    if (!book) return;
    try {
      const data = JSON.parse(evt.nativeEvent.data);
      if (data.type === "ready") {
        setReady(true);
        setTotal(data.total || 0);
      } else if (data.type === "page") {
        setCurrent(data.page);
        setTotal(data.total || total);
        const now = Date.now();
        if (now - lastSave.current < 1500) return; // throttle
        lastSave.current = now;
        bookProgress.set({ book_id: String(book.id), page: data.page, total_pages: data.total || 0 });
      }
    } catch {}
  }, [book, total]);

  const onDownloadForOffline = useCallback(async () => {
    if (!book || !book.pdf_url) return;
    setDownloadedFrac(0);
    const unsub = downloads.subscribe((reg) => {
      const it = reg[String(book.id)];
      if (it) setDownloadedFrac(it.progress);
      if (it?.status === "ready") { setLocalUri(it.local_uri || null); unsub(); }
    });
    await downloads.start({
      id: String(book.id),
      kind: "book",
      title: book.title,
      cover: book.image,
      remote_url: book.pdf_url,
      version: book.modified || null,
    });
  }, [book]);

  if (!book || !html) return <View style={styles.root}><CenteredLoader /></View>;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable testID="reader-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title} numberOfLines={1}>{book.title}</Text>
          <Text style={styles.subtitle}>
            {ready ? `Page ${current}${total ? ` of ${total}` : ""}` : "Loading…"}
            {localUri ? " · Offline" : ""}
          </Text>
        </View>
        <Pressable
          testID="reader-download"
          onPress={onDownloadForOffline}
          style={styles.iconBtn}
          hitSlop={12}
          disabled={!book.pdf_url || !!localUri}
        >
          <Ionicons
            name={localUri ? "cloud-done" : "cloud-download-outline"}
            size={20}
            color={localUri ? colors.brandPrimary : "#FFF"}
          />
        </Pressable>
      </SafeAreaView>

      {!ready && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={styles.loadingText}>Opening “{book.title}”</Text>
          {downloadedFrac > 0 && downloadedFrac < 1 && (
            <Text style={styles.loadingText}>Downloading… {Math.round(downloadedFrac * 100)}%</Text>
          )}
        </View>
      )}

      <WebViewOrIframe
        html={html}
        onMessage={onMessage}
      />
    </View>
  );
}

// react-native-webview doesn't ship a web build. On web preview we render a raw iframe with srcDoc.
function WebViewOrIframe({ html, onMessage }: { html: string; onMessage: (evt: WebViewMessageEvent) => void }) {
  if (Platform.OS === "web") {
    // Bridge iframe postMessage → same shape as react-native-webview's onMessage.
    const ref = React.useRef<any>(null);
    React.useEffect(() => {
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
    // Patch html so the iframe uses window.parent.postMessage instead of ReactNativeWebView
    const iframeHtml = html.replace(
      "window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg))",
      "window.parent.postMessage(JSON.stringify(msg), '*')"
    );
    return React.createElement("iframe", {
      ref,
      srcDoc: iframeHtml,
      style: { flex: 1, border: 0, backgroundColor: "#231F20", width: "100%", height: "100%" },
      sandbox: "allow-scripts allow-same-origin",
    });
  }
  return (
    <WebView
      testID="reader-webview"
      source={{ html, baseUrl: "https://retirementorship.com/" }}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      onMessage={onMessage}
      style={styles.webview}
      androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#231F20" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: "#231F20",
    gap: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)",
  },
  title: { color: "#FFF", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  subtitle: { color: "#F0E6D2", fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginTop: 2, textTransform: "uppercase" },
  loading: {
    position: "absolute",
    top: 100, left: 0, right: 0, alignItems: "center",
    gap: spacing.md, zIndex: 2,
  },
  loadingText: { color: "#F0E6D2", fontSize: 13 },
  webview: { flex: 1, backgroundColor: "#231F20" },
});
