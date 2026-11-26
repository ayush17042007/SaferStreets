import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// The repo keeps one .env at the root; load it without overriding real env vars.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(rootEnv, "utf8")))) {
    if (process.env[k] === undefined && v !== undefined) process.env[k] = v;
  }
}

// MapLibre 6 runs tiles in a module web worker that bundlers cannot locate. Serve its two worker files
// from /maplibre/ (generated, git-ignored) and point MapLibre at them with setWorkerUrl.
try {
  const dist = resolve(createRequire(import.meta.url).resolve("maplibre-gl/package.json"), "..", "dist");
  const out = resolve(process.cwd(), "public/maplibre");
  mkdirSync(out, { recursive: true });
  for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(resolve(dist, f), resolve(out, f));
} catch {
  // maplibre-gl not installed yet (first install): the map falls back to the list.
}

// Same origin (Part B2): the browser only ever talks to the web origin; /api/* is proxied to
// Express so the session cookie stays first-party.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
