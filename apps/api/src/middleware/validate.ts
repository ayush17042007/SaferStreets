// Zod validation for body, query and params. Strings are trimmed; unknown keys are stripped
// (zod objects strip by default). Parsed values replace req.body/params/query and are also on req.valid.
import type { RequestHandler } from "express";
import type { z } from "zod";
import type { ErrorDetail } from "@saferstreets/shared";
import { errors, zodDetails } from "../lib/errors.js";

export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Recursively trim every string in plain JSON-like input. */
export function deepTrim(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(deepTrim);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepTrim(v)]));
  return value;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const valid: NonNullable<Express.Request["valid"]> = {};
    const details: ErrorDetail[] = [];
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(deepTrim(req[part] ?? {}));
      if (result.success) valid[part] = result.data;
      else details.push(...zodDetails(result.error, part));
    }
    if (details.length) return next(errors.validation(details));

    if ("body" in valid) req.body = valid.body;
    if ("params" in valid) req.params = valid.params as typeof req.params;
    // Express 5 exposes req.query as a getter; redefine it with the parsed value.
    if ("query" in valid) Object.defineProperty(req, "query", { value: valid.query, writable: true });
    req.valid = valid;
    next();
  };
}
