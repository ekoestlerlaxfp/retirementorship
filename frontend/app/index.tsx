import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { colors } from "@/src/theme";
import { useAuth } from "@/src/context/auth";

const STAGE_KEY = "rm_stage";

export default function Index() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    // Wait for auth to hydrate before deciding — a logged-in user may
    // already have a retirement_stage on the server even if the local
    // AsyncStorage cache was cleared (e.g. after reinstall or cache wipe).
    if (loading) return;
    (async () => {
      const stage = await AsyncStorage.getItem(STAGE_KEY);
      if (stage) {
        setOnboarded(true);
        return;
      }
      // Backfill from the server-side profile if we have one.
      if (user?.retirement_stage) {
        try { await AsyncStorage.setItem(STAGE_KEY, user.retirement_stage); } catch {}
        setOnboarded(true);
        return;
      }
      setOnboarded(false);
    })();
  }, [loading, user]);

  if (onboarded === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <Redirect href={onboarded ? "/(tabs)" : "/onboarding"} />;
}
