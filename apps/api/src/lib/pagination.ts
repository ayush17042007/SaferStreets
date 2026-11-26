// Cursor pagination helper (Part B5). Keyset over (createdAt DESC, id DESC) by default.
// Usage: fetch `limit + 1` rows ordered by the key, then call buildCursorPage.
import type { CursorPage } from "@saferstreets/shared";
import { z } from "zod";
import { errors } from "./errors.js";

const cursorSchema = z.object({ t: z.iso.datetime(), id: z.string().min(1) });
export type Cursor = { createdAt: Date; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), id: c.id })).toString("base64url");
}

export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return { createdAt: new Date(parsed.t), id: parsed.id };
  } catch {
    throw errors.validation([{ field: "cursor", message: "Invalid cursor" }]);
  }
}

/**
 * Turn `limit + 1` fetched rows into a page. The extra row only signals that more exist.
 * `map` converts DB rows to the response projection.
 */
export function buildCursorPage<Row extends { createdAt: Date; id: string }, Out = Row>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Out = (r) => r as unknown as Out,
): CursorPage<Out> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    data: pageRows.map(map),
    meta: { nextCursor: hasMore && last ? encodeCursor(last) : null },
  };
}

/** Prisma `where` fragment for rows strictly after the cursor in (createdAt DESC, id DESC) order. */
export function afterCursor(c: Cursor | undefined) {
  if (!c) return {};
  return {
    OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }],
  };
}

export const cursorOrderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
