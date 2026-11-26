// Cursor pagination (Part B5): ?cursor=...&limit=20 -> { data, meta: { nextCursor } }.
// Admin tables may use offset pagination (appendix-07 7.2 shape).
import { z } from "zod";

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    meta: z.object({ nextCursor: z.string().nullable() }),
  });
}

export const offsetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type OffsetQuery = z.infer<typeof offsetQuerySchema>;

export interface OffsetPage<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}
