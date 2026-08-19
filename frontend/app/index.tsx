import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { colors } from "@/src/theme";

export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const stage = await AsyncStorage.getItem("rm_stage");
      setOnboarded(!!stage);
    })();
  }, []);
  if (onboarded === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <Redirect href={onboarded ? "/(tabs)" : "/onboarding"} />;
}
