import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { H1, Muted, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import { Field } from "./login";

export default function ForgotScreen() {
  const { forgotPassword, resetPassword } = useAuth();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendCode = useCallback(async () => {
    setError(null); setInfo(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Enter a valid email."); return; }
    setBusy(true);
    try {
      await forgotPassword(email);
      setInfo("If that account exists, we sent a 6-digit reset code to your inbox.");
      setStep("reset");
    } catch (e: any) {
      setError("Something went wrong. Try again.");
    } finally { setBusy(false); }
  }, [email, forgotPassword]);

  const doReset = useCallback(async () => {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      await resetPassword(email, code, password);
      router.replace("/(tabs)");
    } catch (e: any) {
      const msg = String(e?.message || "");
      const m = msg.match(/API 4\d\d:\s*(.+)/);
      let detail = m ? m[1] : "Invalid code.";
      try { const j = JSON.parse(detail); detail = j.detail || detail; } catch {}
      setError(detail);
    } finally { setBusy(false); }
  }, [email, code, password, resetPassword]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="forgot-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>

          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.kicker}>PASSWORD RESET</Text>
            <H1 style={{ marginTop: 4 }}>{step === "email" ? "Forgot your password?" : "Enter your new password"}</H1>
            <Muted style={{ marginTop: spacing.sm }}>
              {step === "email"
                ? "Enter your email and we'll send you a 6-digit reset code."
                : `We sent a code to ${email}. Enter it below to set a new password.`}
            </Muted>
          </View>

          <View style={styles.form}>
            {step === "email" ? (
              <>
                <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com"
                  keyboardType="email-address" autoCapitalize="none" autoComplete="email" testID="forgot-email" />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="forgot-send" label={busy ? "Sending…" : "Send reset code"} onPress={sendCode} icon="mail" />
              </>
            ) : (
              <>
                <Field label="6-digit code" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" maxLength={6} testID="forgot-code" />
                <Field label="New password" value={password} onChangeText={setPassword} placeholder="At least 8 characters"
                  secureTextEntry={!showPw} autoComplete="password-new" testID="forgot-newpw"
                  rightIcon={showPw ? "eye-off" : "eye"} onPressRight={() => setShowPw((v) => !v)} />
                {info ? <Text style={styles.info}>{info}</Text> : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton testID="forgot-reset" label={busy ? "Updating…" : "Reset password & sign in"} onPress={doReset} icon="lock-closed" />
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing["3xl"] },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.6 },
  form: { gap: spacing.md, marginTop: spacing.xl },
  error: { color: "#B03030", fontWeight: "600" },
  info: { color: colors.brandSecondary, fontWeight: "600" },
});
