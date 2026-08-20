import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, BRAND } from "@/src/theme";
import { H1, Muted, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import { Field } from "./login";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    setError(null);
    if (!first.trim() || !last.trim()) { setError("Enter your first and last name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Please enter a valid email address."); return; }
    if (!phone.trim()) { setError("Please enter a phone number."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      await register({ first_name: first, last_name: last, email, phone, password });
      router.replace("/(tabs)");
    } catch (e: any) {
      const msg = String(e?.message || "");
      const m = msg.match(/API 4\d\d:\s*(.+)/);
      let detail = m ? m[1] : "Registration failed.";
      try { const j = JSON.parse(detail); detail = j.detail || detail; } catch {}
      setError(detail);
    } finally { setBusy(false); }
  }, [first, last, email, phone, password, register]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            testID="reg-back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>

          <View style={styles.brand}>
            <Image source={{ uri: BRAND.logoUrl }} style={styles.logo} contentFit="contain" transition={200} />
            <Text style={styles.kicker}>JOIN RETIREMENTORSHIP</Text>
            <H1 style={{ marginTop: 4 }}>Create your account</H1>
            <Muted style={{ marginTop: spacing.sm, textAlign: "center" }}>
              Save articles, track progress, and unlock the full magazine library.
            </Muted>
          </View>

          <View style={styles.form}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="First name" value={first} onChangeText={setFirst} placeholder="Ada" autoCapitalize="words" autoComplete="given-name" testID="reg-first" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Last name" value={last} onChangeText={setLast} placeholder="Lovelace" autoCapitalize="words" autoComplete="family-name" testID="reg-last" />
              </View>
            </View>

            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" testID="reg-email" />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" keyboardType="phone-pad" autoComplete="tel" testID="reg-phone" />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry={!showPw}
              autoComplete="password-new"
              testID="reg-password"
              rightIcon={showPw ? "eye-off" : "eye"}
              onPressRight={() => setShowPw((v) => !v)}
            />

            {error ? <Text style={styles.error} testID="reg-error">{error}</Text> : null}

            <PrimaryButton
              testID="reg-submit"
              label={busy ? "Creating account…" : "Create account"}
              onPress={onSubmit}
              icon="person-add"
            />

            <Text style={styles.legal}>
              By continuing you agree to the {BRAND.name} terms and privacy policy.
            </Text>

            <View style={styles.divider} />

            <View style={{ alignItems: "center" }}>
              <Muted>Already have an account?</Muted>
              <Pressable onPress={() => router.replace("/(auth)/login")} style={{ marginTop: 8 }}>
                <Text style={styles.linkStrong} testID="reg-go-login">Sign in</Text>
              </Pressable>
            </View>
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
  brand: { alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.lg },
  logo: { width: 64, height: 40, marginBottom: spacing.sm },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.6 },
  form: { gap: spacing.md },
  error: { color: "#B03030", fontWeight: "600", marginTop: 4 },
  legal: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: spacing.md },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xl },
  linkStrong: { color: colors.brandPrimary, fontWeight: "800", fontSize: 15 },
});
