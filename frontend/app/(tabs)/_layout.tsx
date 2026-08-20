import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

const TAB_BG = "rgba(255,253,250,0.88)";

function TabBg() {
  if (Platform.OS === "ios") {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(255,253,250,0.35)" }]} />
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: 28, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)" }]} />
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: TAB_BG, borderRadius: 28 }]} />
      <View style={[StyleSheet.absoluteFillObject, { borderRadius: 28, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)" }]} />
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
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          paddingVertical: 0,
          paddingTop: 0,
          paddingBottom: 0,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: Math.max(16, insets.bottom + 8),
          borderTopWidth: 0,
          borderRadius: 28,
          height: 60,
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
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: "Learn",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "school" : "school-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "tab-learn",
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calculator" : "calculator-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "tab-tools",
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "heart" : "heart-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "tab-library",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={26} color={color} />
          ),
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
