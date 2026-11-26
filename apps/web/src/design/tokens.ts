// Lamplight design tokens (Part A2). The ONLY file allowed to contain hex colours.
// Structured as named themes so a dark theme can be added later; only `light` ships (Part 0.4).

export const lightColors = {
  ink: "#111A3B",
  "ink-soft": "#182350",
  "ink-road": "#26336B",
  "ink-border": "#3A4580",
  "ink-muted-on-dark": "#B9C0DE",
  "text-secondary": "#5A6385",
  "text-muted": "#8E96B3",
  cream: "#FAF7F2",
  card: "#FFFFFF",
  line: "#E8E3D9",
  "line-frame": "#DDD7CB",
  "line-control": "#D9D3C7",
  "neutral-chip": "#F1EEE6",
  "neutral-bubble": "#F3EFE6",
  track: "#E2DCCF",
  "track-journey-ring": "#E8E3D9",
  "track-journey-bar": "#EEEAF8",
  amber: "#FFB020",
  "amber-tint": "#FFF1D0",
  "amber-text": "#7A4B00",
  "amber-warn-bg": "#FFFBF2",
  "amber-warn-border": "#F3DDB0",
  mint: "#19C39A",
  "mint-tint": "#D9F7EE",
  "mint-text": "#0B6B55",
  periwinkle: "#6C63FF",
  "periwinkle-tint": "#E9E8FF",
  "periwinkle-text": "#3B34B8",
  "periwinkle-border": "#D5D2FF",
  coral: "#FF5A5F",
  "coral-tint": "#FFE3E4",
  "coral-text": "#A3242A",
  "coral-border": "#FFC9CB",
  "emergency-solid": "#D92D3A",
  white: "#FFFFFF",
  // Map-only values from A4 (custom light map style).
  "map-road-casing": "#EFEAE0",
  "map-park": "#D6EBDD",
  // A4 says "muted water" without a value; a pale cool grey-blue that sits quietly on cream.
  "map-water": "#DCE6EE",
} as const;

export type ColorToken = keyof typeof lightColors;

export const themes = { light: lightColors } as const;
export type ThemeName = keyof typeof themes;

/** Module identity colours (A2). */
export const moduleColors = {
  saferoute: "amber",
  automate: "mint",
  journeyguard: "periwinkle",
  safealert: "coral",
} as const satisfies Record<string, ColorToken>;

export const radii = {
  chip: "999px",
  control: "12px",
  "control-sm": "10px",
  card: "16px",
  banner: "14px",
  panel: "20px",
  hero: "24px",
  map: "24px",
  logo: "9px",
  avatar: "50%",
} as const;

/** Heights and fixed sizes in px (A2 "Spacing, radius, sizes"). */
export const sizes = {
  button: 40,
  "button-mobile": 44,
  "button-hero": 48,
  input: 44,
  "input-mobile": 48,
  "icon-bubble": 40,
  "icon-bubble-sm": 28,
  avatar: 40,
  "avatar-sm": 32,
  sidebar: 240,
  topbar: 64,
  tabbar: 64,
  chip: 24,
  "touch-min": 44,
  "otp-box-w": 48,
  "otp-box-h": 56,
  "content-max": 1200,
  "landing-max": 1120,
} as const;

/** 4 px grid (A2). Keys are multiples; values in px. */
export const spacing = {
  0: "0px",
  0.5: "2px",
  1: "4px",
  1.5: "6px",
  2: "8px",
  2.5: "10px",
  3: "12px",
  3.5: "14px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "28px",
  8: "32px",
  10: "40px",
  11: "44px",
  12: "48px",
  14: "56px",
  16: "64px",
  20: "80px",
  24: "96px",
  60: "240px",
} as const;

export const shadows = {
  hover: "0 6px 18px rgba(17,26,59,0.08)",
  popover: "0 12px 32px rgba(17,26,59,0.14)",
  overlay: "rgba(17,26,59,0.5)",
} as const;

export const focusRing = {
  /** 2px solid ink, offset 2, plus outer 4px amber glow (A2). */
  outline: "2px solid #111A3B",
  offset: "2px",
  glow: "0 0 0 4px rgba(255,176,32,0.45)",
} as const;

export const motion = {
  fast: "150ms",
  sheet: "220ms",
  shimmer: "1.4s",
  pulse: "2s",
  breathe: "4s",
  easing: "ease-out",
} as const;

export const breakpoints = { min: 360, md: 768, lg: 1024, xl: 1280 } as const;

export interface TypeStep {
  size: number;
  line: number;
  weight: number;
  family: "display" | "body";
  letterSpacing?: string;
}

/** Type scale desktop / mobile (A2). Caption 12/16 is the minimum text size. */
export const typeScale = {
  display: {
    desktop: { size: 56, line: 60, weight: 600, family: "display", letterSpacing: "-0.02em" },
    mobile: { size: 40, line: 44, weight: 600, family: "display", letterSpacing: "-0.02em" },
  },
  h1: {
    desktop: { size: 32, line: 38, weight: 600, family: "display" },
    mobile: { size: 28, line: 34, weight: 600, family: "display" },
  },
  h2: {
    desktop: { size: 24, line: 30, weight: 600, family: "display" },
    mobile: { size: 22, line: 28, weight: 600, family: "display" },
  },
  h3: {
    desktop: { size: 18, line: 24, weight: 600, family: "display" },
    mobile: { size: 18, line: 24, weight: 600, family: "display" },
  },
  body: {
    desktop: { size: 16, line: 24, weight: 400, family: "body" },
    mobile: { size: 16, line: 24, weight: 400, family: "body" },
  },
  "body-dense": {
    desktop: { size: 14, line: 20, weight: 400, family: "body" },
    mobile: { size: 14, line: 20, weight: 400, family: "body" },
  },
  small: {
    desktop: { size: 14, line: 20, weight: 400, family: "body" },
    mobile: { size: 14, line: 20, weight: 400, family: "body" },
  },
  caption: {
    desktop: { size: 12, line: 16, weight: 400, family: "body" },
    mobile: { size: 12, line: 16, weight: 400, family: "body" },
  },
  number: {
    desktop: { size: 32, line: 38, weight: 600, family: "display" },
    mobile: { size: 28, line: 34, weight: 600, family: "display" },
  },
} as const satisfies Record<string, { desktop: TypeStep; mobile: TypeStep }>;

export type TypeStepName = keyof typeof typeScale;
