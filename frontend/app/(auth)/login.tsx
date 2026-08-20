import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, BRAND } from "@/src/theme";
import { H1, Muted, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const onSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace("/(tabs)");
    } catch (e: any) {
      const msg = String(e?.message || "");
      const m = msg.match(/API 4\d\d:\s*(.+)/);
      let detail = m ? m[1] : "Sign in failed.";
      try { const j = JSON.parse(detail); detail = j.detail || detail; } catch {}
      if (msg.includes("403") && detail.toLowerCase().includes("verify")) {
        router.push({ pathname: "/(auth)/verify", params: { email: email.trim() } });
        return;
      }
      setError(detail);
    } finally { setBusy(false); }
  }, [email, password, signIn]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            testID="login-back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>

          <View style={styles.brand}>
            <Image source={{ uri: BRAND.logoUrl }} style={styles.logo} contentFit="contain" transition={200} />
            <Text style={styles.kicker}>WELCOME BACK</Text>
            <H1 style={{ marginTop: 4 }}>Sign in</H1>
            <Muted style={{ marginTop: spacing.sm }}>
              Continue your retirement education.
            </Muted>
          </View>

          <View style={styles.form}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="login-email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={!showPw}
              autoComplete="password"
              testID="login-password"
              rightIcon={showPw ? "eye-off" : "eye"}
              onPressRight={() => setShowPw((v) => !v)}
            />

            {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

            <PrimaryButton
              testID="login-submit"
              label={busy ? "Signing in…" : "Sign in"}
              onPress={onSubmit}
              icon="log-in"
            />

            <Pressable onPress={() => router.push("/(auth)/forgot")} style={styles.link}>
              <Text style={styles.linkText}>Forgot your password?</Text>
            </Pressable>

            <View style={styles.divider} />

            <View style={{ alignItems: "center" }}>
              <Muted>New to RetireMentorship?</Muted>
              <Pressable onPress={() => router.replace("/(auth)/register")} style={{ marginTop: 8 }}>
                <Text style={styles.linkStrong} testID="login-go-register">Create your free account</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function Field(props: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; keyboardType?: any; secureTextEntry?: boolean; autoCapitalize?: any;
  autoComplete?: any; testID?: string; rightIcon?: keyof typeof Ionicons.glyphMap; onPressRight?: () => void;
  maxLength?: number;
}) {
  const {
    label, value, onChangeText, placeholder, keyboardType, secureTextEntry,
    autoCapitalize, autoComplete, testID, rightIcon, onPressRight, maxLength,
  } = props;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInner}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          testID={testID}
          maxLength={maxLength}
          style={styles.input}
          placeholderTextColor={colors.muted}
        />
        {rightIcon ? (
          <Pressable onPress={onPressRight} hitSlop={12} style={styles.rightIconBtn}>
            <Ionicons name={rightIcon} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
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
  brand: { alignItems: "center", marginTop: spacing.md, marginBottom: spacing.xl },
  logo: { width: 72, height: 48, marginBottom: spacing.md },
  kicker: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.6 },
  form: { gap: spacing.md, marginTop: spacing.md },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  fieldInner: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.onSurface,
    // @ts-ignore — web-only: kill Chrome's outline halo
    outlineStyle: "none" as any,
  },
  rightIconBtn: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: "#B03030", fontWeight: "600", marginTop: 4 },
  link: { alignItems: "center", marginTop: spacing.md },
  linkText: { color: colors.brandSecondary, fontWeight: "600" },
  linkStrong: { color: colors.brandPrimary, fontWeight: "800", fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xl },
});
