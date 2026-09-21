import React from "react";
import { Tabs } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

const TAB_BG = "rgba(255,253,250,0.88)";

function TabBg() {
  // iOS 26+ — use the real liquid-glass primitive
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <GlassView
          glassEffectStyle="regular"
          colorScheme="light"
          tintColor="rgba(255,253,250,0.55)"
          isInteractive
          style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
        />
        {/* Keep dark artwork from overwhelming the glass and icon contrast. */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: 28, backgroundColor: "rgba(255,253,250,0.4)" }]}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 28, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)" },
          ]}
        />
      </View>
    );
  }
  // iOS < 26 — best effort with BlurView + warm tint
  if (Platform.OS === "ios") {
    return (
      <View style={StyleSheet.absoluteFill}>
        <BlurView intensity={70} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: "hidden" }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,253,250,0.55)", borderRadius: 28 }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 28, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)" }]} />
      </View>
    );
  }
  // Android — solid pill (no free blur that looks good enough)
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TAB_BG, borderRadius: 28 }]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: 28, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)" }]} />
    </View>
  );
}

// Centered icon wrapper. Under expo-router 7 (SDK 57, RN Navigation v7)
// the tab item needs `height: '100%'` + explicit iconStyle to reliably
// center icons when labels are hidden.
const iconCenter: any = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
};

function TabIcon({ name, color, size = 24 }: { name: React.ComponentProps<typeof Ionicons>["name"]; color: ColorValue; size?: number }) {
  return (
    <View style={iconCenter}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandSecondary,
        tabBarInactiveTintColor: "#514B55",
        tabBarShowLabel: false,
        tabBarLabelStyle: { display: "none" },
        tabBarItemStyle: {
          height: "100%",
          paddingVertical: 0,
          paddingTop: 0,
          paddingBottom: 0,
          margin: 0,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarIconStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 0,
        },
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          marginHorizontal: 24,
          bottom: Math.max(16, insets.bottom + 8),
          borderTopWidth: 0,
          borderRadius: 28,
          height: 52,
          paddingVertical: 0,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 8,
          backgroundColor: "transparent",
          overflow: "hidden",
          shadowColor: "#231F20",
          shadowOpacity: 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        },
        tabBarBackground: () => <TabBg />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} color={color} />
          ),
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "school" : "school-outline"} color={color} />
          ),
          tabBarButtonTestID: "tab-learn",
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "calculator" : "calculator-outline"} color={color} />
          ),
          tabBarButtonTestID: "tab-tools",
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "heart" : "heart-outline"} color={color} />
          ),
          tabBarButtonTestID: "tab-library",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "person-circle" : "person-circle-outline"} color={color} size={26} />
          ),
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
