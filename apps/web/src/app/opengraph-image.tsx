import { ImageResponse } from "next/og";
import { NightMap } from "@/components/brand/NightMap";
import { lightColors } from "@/design/tokens";

export const alt = "SaferStreets: light up every journey";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Open Graph image generated from the NightMap illustration plus the headline. Static at build time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: lightColors.cream,
        alignItems: "center",
        padding: 64,
        gap: 48,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: lightColors.ink }}>SaferStreets</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            color: lightColors.ink,
          }}
        >
          <span>Light up</span>
          <div style={{ display: "flex", gap: 16 }}>
            <span>every</span>
            <span style={{ background: lightColors.amber, padding: "0 16px", borderRadius: 16 }}>journey.</span>
          </div>
        </div>
        <div style={{ fontSize: 28, color: lightColors["text-secondary"] }}>
          Report, share a ride, tell someone you trust.
        </div>
      </div>
      <div style={{ display: "flex", width: 480, height: 360, borderRadius: 32, overflow: "hidden" }}>
        <NightMap inline fit="cover" />
      </div>
    </div>,
    size,
  );
}
