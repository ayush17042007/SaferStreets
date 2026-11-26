// Night-map illustration (A3): one SVG on ink. No text inside. Original artwork.
// `inline` paints with token hex values as attributes (for the Open Graph image renderer, which
// does not read CSS classes); the default paints with Tailwind token classes.
import { cn } from "@/components/ui/cn";
import { lightColors, type ColorToken } from "@/design/tokens";

const FILL = {
  ink: "fill-ink",
  "ink-soft": "fill-ink-soft",
  amber: "fill-amber",
  mint: "fill-mint",
  coral: "fill-coral",
  white: "fill-white",
} as const;
const STROKE = {
  "ink-road": "stroke-ink-road",
  mint: "stroke-mint",
  white: "stroke-white",
} as const;

type FillToken = keyof typeof FILL;
type StrokeToken = keyof typeof STROKE;

// Streetlamps placed along the roads: [x, y].
const LAMPS: ReadonlyArray<readonly [number, number]> = [
  [60, 150],
  [120, 150],
  [190, 150],
  [260, 150],
  [330, 150],
  [105, 40],
  [105, 100],
  [105, 210],
  [105, 265],
  [250, 40],
  [250, 100],
  [250, 210],
  [250, 265],
  [30, 230],
  [180, 230],
  [330, 230],
];

const BLOCKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [14, 14, 76, 120],
  [120, 14, 116, 62],
  [120, 84, 116, 52],
  [266, 14, 120, 120],
  [14, 166, 76, 52],
  [120, 166, 116, 52],
  [266, 166, 120, 52],
  [14, 248, 76, 38],
  [120, 248, 116, 38],
  [266, 248, 120, 38],
];

const ROADS: ReadonlyArray<readonly [string, number]> = [
  ["M0 150 H400", 10],
  ["M105 0 V300", 10],
  ["M250 0 V300", 5],
  ["M0 230 H400", 5],
  ["M0 80 H105", 5],
  ["M250 80 H400", 5],
];

export interface NightMapProps {
  className?: string;
  /** Lamp halos breathe very subtly (4 s); off by default. Respects reduced motion via CSS. */
  breathe?: boolean;
  /** How the SVG scales inside its box. `cover` fills a column (dashboard greeting). */
  fit?: "cover" | "contain";
  /** Paint with hex attributes instead of classes (Open Graph image). */
  inline?: boolean;
}

export function NightMap({ className, breathe = false, fit = "cover", inline = false }: NightMapProps) {
  const fill = (t: FillToken) => (inline ? { fill: lightColors[t as ColorToken] } : { className: FILL[t] });
  const stroke = (t: StrokeToken) => (inline ? { stroke: lightColors[t as ColorToken] } : { className: STROKE[t] });
  const both = (f: FillToken, s: StrokeToken) =>
    inline
      ? { fill: lightColors[f as ColorToken], stroke: lightColors[s as ColorToken] }
      : { className: `${FILL[f]} ${STROKE[s]}` };

  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio={fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
      className={cn("block h-full w-full", className)}
      role="img"
      aria-label="Illustration of a city at night with lit streets, a safe route and one alert"
      xmlns="http://www.w3.org/2000/svg"
      width={inline ? 400 : undefined}
      height={inline ? 300 : undefined}
    >
      <rect width="400" height="300" {...fill("ink")} />

      {/* city blocks */}
      {BLOCKS.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="14" {...fill("ink-soft")} />
      ))}

      {/* roads: main 10 units, side 5 */}
      {ROADS.map(([d, w]) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth={w}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke("ink-road")}
        />
      ))}

      {/* streetlamps: 3.5 dot + 16 halo at 16% */}
      {LAMPS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle
            cx={x}
            cy={y}
            r="16"
            opacity="0.16"
            {...fill("amber")}
            {...(breathe && !inline ? { className: `${FILL.amber} breathe` } : {})}
          />
          <circle cx={x} cy={y} r="3.5" {...fill("amber")} />
        </g>
      ))}

      {/* safe route: 4 units, mint, round joins */}
      <polyline
        points="60,150 105,150 105,100 190,100 190,150 250,150 250,210 330,210"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...stroke("mint")}
      />
      <circle cx="60" cy="150" r="7" strokeWidth="3" {...both("white", "mint")} />
      <circle cx="330" cy="210" r="7" strokeWidth="2.5" {...both("mint", "white")} />

      {/* one alert pin: coral with white outline */}
      <circle cx="190" cy="40" r="7" strokeWidth="2.5" {...both("coral", "white")} />
    </svg>
  );
}
