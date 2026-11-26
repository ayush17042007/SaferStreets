// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTokensCss } from "../../../../scripts/gen-tokens-css";
import { scan } from "../../../../scripts/check-tokens";
import { breakpoints, lightColors, motion, radii, shadows, sizes, typeScale } from "./tokens";

describe("A2 token values", () => {
  it("has the exact core hex values", () => {
    expect(lightColors).toMatchObject({
      ink: "#111A3B",
      cream: "#FAF7F2",
      card: "#FFFFFF",
      line: "#E8E3D9",
      amber: "#FFB020",
      mint: "#19C39A",
      periwinkle: "#6C63FF",
      coral: "#FF5A5F",
      "emergency-solid": "#D92D3A",
      "ink-soft": "#182350",
      "ink-road": "#26336B",
      "ink-border": "#3A4580",
      "ink-muted-on-dark": "#B9C0DE",
      "text-secondary": "#5A6385",
      "text-muted": "#8E96B3",
      "line-frame": "#DDD7CB",
      "line-control": "#D9D3C7",
      "neutral-chip": "#F1EEE6",
      "neutral-bubble": "#F3EFE6",
      track: "#E2DCCF",
      "amber-tint": "#FFF1D0",
      "amber-text": "#7A4B00",
      "amber-warn-bg": "#FFFBF2",
      "amber-warn-border": "#F3DDB0",
      "mint-tint": "#D9F7EE",
      "mint-text": "#0B6B55",
      "periwinkle-tint": "#E9E8FF",
      "periwinkle-text": "#3B34B8",
      "periwinkle-border": "#D5D2FF",
      "coral-tint": "#FFE3E4",
      "coral-text": "#A3242A",
      "coral-border": "#FFC9CB",
    });
  });

  it("has the A2 radii, sizes, shadows, motion and breakpoints", () => {
    expect(radii).toMatchObject({ chip: "999px", control: "12px", card: "16px", panel: "20px", hero: "24px" });
    expect(sizes).toMatchObject({
      button: 40,
      "button-mobile": 44,
      "button-hero": 48,
      input: 44,
      "input-mobile": 48,
      sidebar: 240,
      topbar: 64,
      tabbar: 64,
    });
    expect(shadows.hover).toBe("0 6px 18px rgba(17,26,59,0.08)");
    expect(shadows.popover).toBe("0 12px 32px rgba(17,26,59,0.14)");
    expect(shadows.overlay).toBe("rgba(17,26,59,0.5)");
    expect(motion).toMatchObject({ fast: "150ms", sheet: "220ms", shimmer: "1.4s", pulse: "2s", breathe: "4s" });
    expect(breakpoints).toEqual({ min: 360, md: 768, lg: 1024, xl: 1280 });
  });

  it("has the A2 type scale desktop / mobile", () => {
    expect(typeScale.display.desktop).toMatchObject({ size: 56, line: 60, weight: 600, letterSpacing: "-0.02em" });
    expect(typeScale.display.mobile).toMatchObject({ size: 40, line: 44 });
    expect(typeScale.h1.desktop).toMatchObject({ size: 32, line: 38 });
    expect(typeScale.h1.mobile).toMatchObject({ size: 28, line: 34 });
    expect(typeScale.h2.desktop).toMatchObject({ size: 24, line: 30 });
    expect(typeScale.h2.mobile).toMatchObject({ size: 22, line: 28 });
    expect(typeScale.h3.desktop).toMatchObject({ size: 18, line: 24, weight: 600 });
    expect(typeScale.body.desktop).toMatchObject({ size: 16, line: 24 });
    expect(typeScale.small.desktop).toMatchObject({ size: 14, line: 20 });
    expect(typeScale.caption.desktop).toMatchObject({ size: 12, line: 16 });
  });
});

describe("generated CSS", () => {
  it("tokens.generated.css is up to date (run pnpm tokens:css)", () => {
    const file = readFileSync(fileURLToPath(new URL("./tokens.generated.css", import.meta.url)), "utf8");
    expect(file).toBe(buildTokensCss());
  });

  it("replaces the default Tailwind palette", () => {
    const css = buildTokensCss();
    expect(css).toContain("--color-*: initial;");
    expect(css).toContain("--color-ink: #111A3B;");
  });
});

describe("check:tokens", () => {
  it("finds no violations in the repository", () => {
    expect(scan()).toEqual([]);
  });

  it("flags hex colours, colour functions and default-palette classes", () => {
    const root = mkdtempSync(join(tmpdir(), "tokens-"));
    mkdirSync(join(root, "apps/web/src/components"), { recursive: true });
    writeFileSync(
      join(root, "apps/web/src/components/Bad.tsx"),
      [
        'const a = "#ff0000";',
        'const b = "rgb(0,0,0)";',
        'const c = "bg-red-500 text-slate-900 border-t-gray-200";',
        'const ok = "bg-ink text-amber-text border-neutral-chip bg-amber-tint href=\\"/about#contact\\"";',
      ].join("\n"),
    );
    const found = scan(root).map((v) => `${v.line}:${v.match}`);
    expect(found).toEqual(["1:#ff0000", "2:rgb(", "3:bg-red-500", "3:text-slate-900", "3:border-t-gray-200"]);
  });
});
