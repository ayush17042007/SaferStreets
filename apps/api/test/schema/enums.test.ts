// packages/shared enums must equal the Postgres enums created by the migrations.
import { ALL_ENUMS } from "@saferstreets/shared";
import { describe, expect, it } from "vitest";
import { pool } from "../helpers.js";

describe("shared enums match the database", () => {
  it("has the same enum types and values in the same order", async () => {
    const { rows } = await pool.query<{ typname: string; labels: string[] }>(`
      SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typnamespace = 'public'::regnamespace
      GROUP BY t.typname`);
    const db = Object.fromEntries(rows.map((r) => [r.typname, r.labels]));
    const shared = Object.fromEntries(Object.entries(ALL_ENUMS).map(([k, v]) => [k, [...v.values]]));
    expect(db).toEqual(shared);
  });
});
