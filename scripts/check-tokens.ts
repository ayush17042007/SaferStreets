// Fails if any hex/rgb/hsl colour literal or Tailwind default-palette class appears in the web app
// outside the token files (apps/web/src/design/tokens.ts and its generated CSS). Part A8: tokens only.
// Usage: pnpm check:tokens

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["apps/web/src", "apps/web/e2e"];
const EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs", ".js"]);
const ALLOWED = new Set(["apps/web/src/design/tokens.ts", "apps/web/src/design/tokens.generated.css"]);

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
const FUNC = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb)\s*\(/g;
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITIES =
  "bg|text|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|shadow|accent|caret|placeholder";
const DEFAULT_PALETTE = new RegExp(`(?<![\\w-])(?:${UTILITIES})-(?:${PALETTE})-(?:50|[1-9]00|950)(?![\\w-])`, "g");
const BLACK = /(?<![\w-])(?:bg|text|border|ring|fill|stroke)-black(?![\w-])/g;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith("__")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) yield full;
  }
}

export interface Violation {
  file: string;
  line: number;
  match: string;
  kind: string;
}

export function scan(root = ROOT): Violation[] {
  const out: Violation[] = [];
  for (const d of SCAN_DIRS) {
    const abs = join(root, d);
    try {
      statSync(abs);
    } catch {
      continue;
    }
    for (const file of walk(abs)) {
      const rel = relative(root, file).split(sep).join("/");
      if (ALLOWED.has(rel) || /\.(test|spec)\.tsx?$/.test(rel)) continue; // tests assert token values; they are not shipped
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const [re, kind] of [
          [HEX, "hex colour"],
          [FUNC, "colour function"],
          [DEFAULT_PALETTE, "Tailwind default palette class"],
          [BLACK, "Tailwind black"],
        ] as const) {
          for (const m of text.matchAll(re)) out.push({ file: rel, line: i + 1, match: m[0], kind });
        }
      });
    }
  }
  return out;
}

if (process.argv[1]?.endsWith("check-tokens.ts")) {
  const violations = scan();
  if (violations.length) {
    console.error(`check:tokens failed: ${violations.length} colour(s) outside the token file`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.kind}  ${v.match}`);
    process.exit(1);
  }
  console.log("check:tokens passed: no hex colours or default-palette classes outside design/tokens.ts");
}
