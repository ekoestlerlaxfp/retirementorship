import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { H1, Muted, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";

export default function FeedbackScreen() {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const full = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email : "";

  const submit = useCallback(async () => {
    setError(null);
    const q = question.trim();
    if (q.length < 3) { setError("Please write a bit more about what's on your mind."); return; }
    if (!user) { router.replace("/(auth)/login"); return; }
    setBusy(true);
    try {
      await api.sendFeedback(q);
      setSent(true);
    } catch (e: any) {
      const msg = String(e?.message || "");
      const m = msg.match(/API 4\d\d:\s*(.+)/);
      let detail = m ? m[1] : "Couldn't send. Please try again.";
      try { const j = JSON.parse(detail); detail = j.detail || detail; } catch {}
      setError(detail);
    } finally { setBusy(false); }
  }, [question, user]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            testID="feedback-back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>

          {sent ? (
            <View style={styles.doneWrap}>
              <View style={styles.doneIcon}>
                <Ionicons name="checkmark-done" size={36} color={colors.success || "#2E7D5B"} />
              </View>
              <H1 style={{ textAlign: "center" }}>Thanks — we&apos;ll be in touch.</H1>
              <Muted style={{ textAlign: "center", marginTop: spacing.md, maxWidth: 340 }}>
                Your question was sent to a RetireMentorship team member. You&apos;ll usually hear back within one business day.
              </Muted>
              <View style={{ marginTop: spacing["2xl"], width: "100%" }}>
                <PrimaryButton testID="feedback-done" label="Back to profile" onPress={() => router.replace("/(tabs)/profile")} icon="arrow-back" />
              </View>
            </View>
          ) : (
            <>
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.kicker}>ASK OUR TEAM</Text>
                <H1 style={{ marginTop: 4 }}>Have a question?</H1>
                <Muted style={{ marginTop: spacing.sm }}>
                  Send us a note and a RetireMentorship team member will reply by email. Great for content requests, planning topics, or anything you&apos;d like us to cover.
                </Muted>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>SENDING AS</Text>
                <Text style={styles.cardName}>{full || "Signed-in reader"}</Text>
                {user?.email ? <Muted>{user.email}</Muted> : null}
              </View>

              <Text style={styles.fieldLabel}>Your question</Text>
              <TextInput
                testID="feedback-input"
                value={question}
                onChangeText={setQuestion}
                placeholder="e.g. How do I plan withdrawals across taxable and tax-deferred accounts in my first five years of retirement?"
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
                style={styles.textarea}
                maxLength={4000}
              />
              <Text style={styles.counter}>{question.length}/4000</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                testID="feedback-send"
                label={busy ? "Sending…" : "Send question"}
                onPress={submit}
                icon="send"
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing["3xl"], gap: spacing.md },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.6 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm,
  },
  cardLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginBottom: 4 },
  cardName: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: spacing.sm },
  textarea: {
    minHeight: 180,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    fontSize: 16, color: colors.onSurface, lineHeight: 24,
    // @ts-ignore web
    outlineStyle: "none" as any,
  },
  counter: { alignSelf: "flex-end", color: colors.muted, fontSize: 12, fontWeight: "600" },
  error: { color: "#B03030", fontWeight: "600" },
  doneWrap: { alignItems: "center", justifyContent: "center", paddingTop: spacing["3xl"] },
  doneIcon: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
});
