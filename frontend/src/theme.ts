// RetireMentorship — design tokens from /app/design_guidelines.json
// Warm cream + gold with deep purple accents. Accessibility-first for 50-75 audience.

export const colors = {
  surface: "#FAF8F5",
  onSurface: "#231F20",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#231F20",
  surfaceTertiary: "#F0E6D2",
  onSurfaceTertiary: "#231F20",
  surfaceInverse: "#231F20",
  onSurfaceInverse: "#FAF8F5",
  brand: "#C5A059",
  brandPrimary: "#C5A059",
  onBrandPrimary: "#231F20",
  brandSecondary: "#4B3166",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E4D0AB",
  onBrandTertiary: "#231F20",
  success: "#356646",
  warning: "#B06935",
  error: "#A83C3C",
  border: "#E5DFD3",
  borderStrong: "#C5A059",
  divider: "#E5DFD3",
  muted: "#7A716A",
} as const;

export const type = {
  family: undefined as string | undefined, // system font — SF Pro on iOS / Roboto on Android
  sizes: { xs: 12, sm: 14, base: 17, lg: 20, xl: 26, "2xl": 34, "3xl": 44, "4xl": 56 },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = { sm: 12, md: 20, lg: 28, xl: 36, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: "#231F20",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  hero: {
    shadowColor: "#231F20",
    shadowOpacity: 0.14,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  floating: {
    shadowColor: "#231F20",
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const stages = [
  { id: "10+", label: "10+ years away", subtitle: "Building the foundation" },
  { id: "5-10", label: "5–10 years away", subtitle: "Sharpening the plan" },
  { id: "0-5", label: "0–5 years away", subtitle: "Final approach" },
  { id: "retired", label: "Already retired", subtitle: "Living it well" },
] as const;

export const CALENDLY_URL = "https://calendly.com/flinde/discovery";

export const BRAND = {
  name: "RetireMentorship",
  taglineLine1: "Retire Successfully.",
  taglineLine2: "Stay Successfully Retired.",
  logoUrl:
    "https://customer-assets-jt897jd0.emergentagent.net/job_wisdom-edge/artifacts/xq6quq8u_RM%20Icon.webp",
} as const;
