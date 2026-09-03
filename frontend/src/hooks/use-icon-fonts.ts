// Icon font loader for Expo apps. Fonts are loaded from a CDN only under
// Expo Go (StoreClient) — that's where @react-native-vector-icons' .ttf
// files come back as 0 bytes from Metro's asset resolver on Android. Native
// dev/prod builds and web pass an empty map, so `useFonts` resolves to
// [true, null] immediately via autolinking / web stubs.
// ICON_VECTOR_VERSION must match @react-native-vector-icons/ionicons in
// package.json.
// Usage: const [loaded, error] = useIconFonts();

import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";

const IONICONS_VERSION = "13.1.3";

// Font family keys must match what the icon component queries via
// `postScriptName` in @react-native-vector-icons/ionicons.
const iconFontMap = (): Record<string, string> => ({
  Ionicons: `https://cdn.jsdelivr.net/npm/@react-native-vector-icons/ionicons@${IONICONS_VERSION}/fonts/Ionicons.ttf`,
});

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts(
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? iconFontMap()
      : {},
  );
