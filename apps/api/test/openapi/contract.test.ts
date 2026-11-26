// Contract test (Part B5): the Express route table, the generated OpenAPI document and the
// committed apps/api/openapi.json must all agree. Regenerate with:
//   pnpm --filter @saferstreets/api openapi:generate
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { describe, expect, it } from "vitest";
import { toOpenApiPath } from "../../src/http/routes.js";
import { buildTestApp } from "../helpers.js";

/** Routes that exist on purpose without a spec entry. */
const UNDOCUMENTED = new Set(["GET /api/docs"]);

interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  name?: string;
}

function expressRoutes(app: Express): Set<string> {
  const router = (app as unknown as { router: { stack: Layer[] } }).router;
  const out = new Set<string>();
  for (const layer of router.stack) {
    if (layer.name === "router") throw new Error("Nested routers are not supported: mount routes with mountRoutes()");
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const p of paths) {
      for (const [m, on] of Object.entries(layer.route.methods)) {
        if (on && m !== "_all") out.add(`${m.toUpperCase()} ${p}`);
      }
    }
  }
  return out;
}

function specRoutes(doc: { paths?: object }): Set<string> {
  const out = new Set<string>();
  for (const [path, item] of Object.entries((doc.paths ?? {}) as Record<string, object>)) {
    for (const method of Object.keys(item)) out.add(`${method.toUpperCase()} ${path}`);
  }
  return out;
}

describe("OpenAPI contract", () => {
  const { app, openapi } = buildTestApp();
  const doc = openapi();

  it("is an OpenAPI 3.1 document", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths?.["/api/health/ready"]?.get).toBeDefined();
  });

  it("documents every Express route and nothing else", () => {
    const routes = new Set(
      [...expressRoutes(app)]
        .filter((r) => !UNDOCUMENTED.has(r))
        .map((r) => {
          const [m, p] = r.split(" ");
          return `${m} ${toOpenApiPath(p!)}`;
        }),
    );
    expect([...specRoutes(doc)].sort()).toEqual([...routes].sort());
  });

  it("matches the committed apps/api/openapi.json (run openapi:generate after changing routes)", () => {
    const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../openapi.json", import.meta.url)), "utf8"));
    expect(doc).toEqual(committed);
  });
});
