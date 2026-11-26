import { describe, expect, it } from "vitest";
import { bannerVariants } from "@/components/ui/Banner";
import { buttonVariants } from "@/components/ui/Button";
import { cardTones } from "@/components/ui/Card";
import { bubbleVariants } from "@/components/ui/IconBubble";
import { chipVariants } from "@/components/ui/StatusChip";
import { lightColors, type ColorToken } from "./tokens";

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

export function ratio(fg: ColorToken, bg: ColorToken): number {
  const [hi, lo] = [luminance(lightColors[fg]), luminance(lightColors[bg])].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = { fg: ColorToken; bg: ColorToken };
const fromVariants = (v: Record<string, Pair>) => Object.entries(v).map(([name, p]) => ({ name, fg: p.fg, bg: p.bg }));

describe("WCAG 2.2 AA contrast", () => {
  it("computes known reference values", () => {
    expect(ratio("white", "ink")).toBeGreaterThan(16);
    expect(ratio("ink", "ink")).toBeCloseTo(1, 5);
  });

  const text: Array<{ name: string; fg: ColorToken; bg: ColorToken }> = [
    ...fromVariants(buttonVariants).map((p) => ({ ...p, name: `button ${p.name}` })),
    ...fromVariants(chipVariants).map((p) => ({ ...p, name: `chip ${p.name}` })),
    ...fromVariants(cardTones).map((p) => ({ ...p, name: `tinted card ${p.name}` })),
    ...fromVariants(bannerVariants).map((p) => ({ ...p, name: `banner ${p.name}` })),
    ...fromVariants(bubbleVariants.tint).map((p) => ({ ...p, name: `tint bubble ${p.name}` })),
    { name: "body text on cream", fg: "ink", bg: "cream" },
    { name: "body text on card", fg: "ink", bg: "card" },
    { name: "secondary text on cream", fg: "text-secondary", bg: "cream" },
    { name: "secondary text on card", fg: "text-secondary", bg: "card" },
    { name: "secondary text on coral-tint (banner caption)", fg: "text-secondary", bg: "coral-tint" },
    { name: "muted-on-dark text on ink", fg: "ink-muted-on-dark", bg: "ink" },
    { name: "muted-on-dark text on ink-soft", fg: "ink-muted-on-dark", bg: "ink-soft" },
    { name: "error text on card", fg: "coral-text", bg: "card" },
    { name: "selected category tile (ink on amber-tint)", fg: "ink", bg: "amber-tint" },
    { name: "selected filter chip", fg: "white", bg: "ink" },
    { name: "amber badge", fg: "ink", bg: "amber" },
  ];

  it.each(text)("text pair $name meets 4.5:1", ({ fg, bg }) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("never puts white text on coral or amber (A2)", () => {
    for (const [name, p] of Object.entries(buttonVariants)) {
      if ((p.bg as ColorToken) === "amber" || (p.bg as ColorToken) === "coral")
        expect(p.fg, `button ${name}`).not.toBe("white");
    }
    for (const [name, p] of Object.entries(bubbleVariants.solid)) {
      if (p.bg === "amber") expect(p.fg, `bubble ${name}`).not.toBe("white");
    }
  });

  // Icons and large graphics need 3:1. Solid bubbles hold icons only, never text.
  it.each(fromVariants(bubbleVariants.solid))("solid bubble $name icon meets 3:1", ({ fg, bg }) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("documents the A2 colours that are below 4.5:1 and so are never used for meaningful text", () => {
    // text-muted (placeholders, decorative chevrons) and white-on-periwinkle (icons only) are
    // specified by A2 but cannot carry text at AA. Components use text-secondary for captions
    // and inactive tabs; see docs/PROGRESS.md "Design deviations".
    expect(ratio("text-muted", "card")).toBeLessThan(4.5);
    expect(ratio("white", "periwinkle")).toBeLessThan(4.5);
    expect(ratio("white", "periwinkle")).toBeGreaterThanOrEqual(3);
    expect(ratio("white", "coral")).toBeGreaterThanOrEqual(3);
  });
});
