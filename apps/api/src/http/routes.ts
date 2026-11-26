// Route definitions: one place that mounts a route on Express AND registers it in OpenAPI,
// so the docs are generated from the same Zod schemas the validator uses (Part B5).
// Every route declares its auth level (deny by default, appendix-09).
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { errorResponseSchema } from "@saferstreets/shared";
import type { Express, RequestHandler } from "express";
import type { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type AuthLevel = "public" | "user" | "moderator" | "admin";

export interface RouteDef {
  method: HttpMethod;
  /** Express path relative to the mount base, e.g. "/reports/:id". */
  path: string;
  summary: string;
  tags: string[];
  auth: AuthLevel;
  request?: {
    body?: z.ZodType;
    query?: z.ZodObject;
    params?: z.ZodObject;
  };
  responses: Record<number, { description: string; schema?: z.ZodType }>;
  /** Extra middleware (rate limits, idempotency) then the handler. */
  handlers: RequestHandler[];
}

export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function guards(auth: AuthLevel): RequestHandler[] {
  switch (auth) {
    case "public":
      return [];
    case "user":
      return [requireAuth];
    case "moderator":
      return [requireAuth, requireRole("MODERATOR")];
    case "admin":
      return [requireAuth, requireRole("ADMIN")];
  }
}

export function mountRoutes(app: Express, registry: OpenAPIRegistry, base: string, routes: RouteDef[]): void {
  for (const r of routes) {
    const fullPath = `${base}${r.path}`.replace(/\/+$/, "") || "/";
    const stack: RequestHandler[] = [...guards(r.auth)];
    if (r.request) stack.push(validate(r.request));
    stack.push(...r.handlers);
    app[r.method](fullPath, ...stack);

    const responses: Record<string, unknown> = {};
    for (const [status, res] of Object.entries(r.responses)) {
      responses[status] = res.schema
        ? { description: res.description, content: { "application/json": { schema: res.schema } } }
        : { description: res.description };
    }
    responses.default ??= {
      description: "Error (appendix-07 7.2 shape with requestId)",
      content: { "application/json": { schema: errorResponseSchema } },
    };

    registry.registerPath({
      method: r.method,
      path: toOpenApiPath(fullPath),
      summary: r.summary,
      tags: r.tags,
      ...(r.auth === "public" ? { security: [] } : { security: [{ session: [] }] }),
      request: {
        ...(r.request?.params ? { params: r.request.params } : {}),
        ...(r.request?.query ? { query: r.request.query } : {}),
        ...(r.request?.body
          ? { body: { content: { "application/json": { schema: r.request.body } }, required: true } }
          : {}),
      },
      responses: responses as never,
    });
  }
}
