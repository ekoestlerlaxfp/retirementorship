import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { H1, Muted, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";

const LEN = 6;

export default function VerifyScreen() {
  const { email: rawEmail, email_error: rawErr } = useLocalSearchParams<{ email?: string; email_error?: string }>();
  const email = String(rawEmail || "");
  const initialDeliveryWarn = String(rawErr || "");
  const { verify, resendCode } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const inputs = useRef<Array<TextInput | null>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialDeliveryWarn && initialDeliveryWarn !== "1" ? initialDeliveryWarn : null);
  const [deliveryWarn, setDeliveryWarn] = useState<boolean>(!!initialDeliveryWarn);
  const [cooldown, setCooldown] = useState(30);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const setDigit = useCallback((i: number, v: string) => {
    // Handle paste of full code
    if (v.length > 1) {
      const clean = v.replace(/\D/g, "").slice(0, LEN);
      const next = clean.padEnd(LEN, "").split("");
      setDigits(next.slice(0, LEN));
      const focusIdx = Math.min(clean.length, LEN - 1);
      inputs.current[focusIdx]?.focus();
      if (clean.length === LEN) submit(clean);
      return;
    }
    if (v && !/^\d$/.test(v)) return;
    setDigits((d) => {
      const next = [...d];
      next[i] = v;
      return next;
    });
    if (v && i < LEN - 1) inputs.current[i + 1]?.focus();
    if (!v && i > 0) {
      // let default backspace behavior handle it; don't force move
    }
    // Auto-submit when last digit filled
    setTimeout(() => {
      const current = [...digits];
      current[i] = v;
      if (current.every((x) => x !== "")) submit(current.join(""));
    }, 0);
  }, [digits]);

  const submit = useCallback(async (code?: string) => {
    setError(null);
    const c = (code || digits.join("")).trim();
    if (c.length !== LEN) { setError("Enter the 6-digit code."); return; }
    if (!email) { setError("Missing email — start over from the sign-in screen."); return; }
    setBusy(true);
    try {
      await verify(email, c);
      router.replace("/(tabs)");
    } catch (e: any) {
      const msg = String(e?.message || "");
      const m = msg.match(/API 4\d\d:\s*(.+)/);
      let detail = m ? m[1] : "Invalid code.";
      try { const j = JSON.parse(detail); detail = j.detail || detail; } catch {}
      setError(detail);
      setDigits(Array(LEN).fill(""));
      inputs.current[0]?.focus();
    } finally { setBusy(false); }
  }, [digits, email, verify]);

  const onResend = useCallback(async () => {
    if (cooldown > 0 || !email) return;
    setError(null);
    try {
      await resendCode(email);
      setResent(true);
      setDeliveryWarn(false);
      setCooldown(30);
    } catch (e: any) {
      const msg = String(e?.message || "");
      const m = msg.match(/API 4\d\d:|API 5\d\d:/);
      let detail = "We couldn't send the code. Double-check the email address is correct.";
      try {
        const idx = msg.indexOf(":");
        if (idx >= 0) {
          const j = JSON.parse(msg.slice(idx + 1).trim());
          detail = j.detail || detail;
        }
      } catch {}
      setError(detail);
      setDeliveryWarn(true);
    }
  }, [cooldown, email, resendCode]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.container}>
          <Pressable testID="verify-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>

          <View style={{ alignItems: "center", marginTop: spacing.xl }}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-open" size={30} color={colors.brandPrimary} />
            </View>
            <Text style={styles.kicker}>CHECK YOUR INBOX</Text>
            <H1 style={{ marginTop: 4, textAlign: "center" }}>Verify your email</H1>
            <Muted style={{ marginTop: spacing.sm, textAlign: "center", maxWidth: 320 }}>
              We sent a 6-digit code to{"\n"}
              <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{email}</Text>
            </Muted>
          </View>

          {deliveryWarn && !resent ? (
            <View style={styles.warn} testID="verify-delivery-warn">
              <Ionicons name="warning" size={18} color="#B03030" />
              <Text style={styles.warnText}>
                We had trouble sending the email. Check your inbox and spam folder, or tap Resend below. If it keeps failing, double-check the email address.
              </Text>
            </View>
          ) : null}

          <View style={styles.digits}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                testID={`verify-digit-${i}`}
                value={d}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={(e) => {
                  if (e.nativeEvent.key === "Backspace" && !d && i > 0) {
                    inputs.current[i - 1]?.focus();
                  }
                }}
                keyboardType="number-pad"
                maxLength={1}
                style={[styles.digit, d ? styles.digitFilled : null]}
                autoFocus={i === 0}
                textContentType={i === 0 ? "oneTimeCode" : undefined}
              />
            ))}
          </View>

          {error ? <Text style={styles.error} testID="verify-error">{error}</Text> : null}
          {resent && !error ? <Text style={styles.info}>New code sent — check your inbox.</Text> : null}

          <PrimaryButton
            testID="verify-submit"
            label={busy ? "Verifying…" : "Verify & continue"}
            onPress={() => submit()}
            icon="checkmark-circle"
          />

          <View style={{ alignItems: "center", marginTop: spacing.lg }}>
            <Muted>Didn&apos;t get the code?</Muted>
            <Pressable onPress={onResend} disabled={cooldown > 0} style={{ marginTop: 6 }}>
              <Text style={[styles.linkStrong, cooldown > 0 && { color: colors.muted }]} testID="verify-resend">
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, padding: spacing.xl },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  iconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.6 },
  digits: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing["2xl"], marginBottom: spacing.lg },
  digit: {
    width: 48, height: 56,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary, textAlign: "center",
    fontSize: 24, fontWeight: "800", color: colors.onSurface,
  },
  digitFilled: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  warn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(176,48,48,0.08)",
    borderWidth: 1,
    borderColor: "rgba(176,48,48,0.25)",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  warnText: { flex: 1, color: "#8A2323", fontSize: 13, lineHeight: 18, fontWeight: "500" },
  error: { color: "#B03030", fontWeight: "600", textAlign: "center", marginBottom: spacing.md },
  info: { color: colors.brandSecondary, fontWeight: "600", textAlign: "center", marginBottom: spacing.md },
  linkStrong: { color: colors.brandPrimary, fontWeight: "800", fontSize: 15 },
});
