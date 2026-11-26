import { describe, expect, it } from "vitest";
import { AppError } from "../../src/lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor, encodeCursor } from "../../src/lib/pagination.js";
import { createUser, prisma } from "../helpers.js";

describe("cursor helpers", () => {
  it("round-trips a cursor", () => {
    const c = { createdAt: new Date("2026-11-25T10:00:00.123Z"), id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it("rejects tampered cursors with a validation error", () => {
    expect(() => decodeCursor("not-base64-json")).toThrow(AppError);
    const forged = Buffer.from(JSON.stringify({ t: "yesterday", id: 1 })).toString("base64url");
    expect(() => decodeCursor(forged)).toThrow(AppError);
  });

  it("uses the extra row only to signal more pages", () => {
    const rows = [1, 2, 3].map((i) => ({ id: String(i), createdAt: new Date(2026, 0, i) }));
    const page = buildCursorPage(rows, 2, (r) => r.id);
    expect(page.data).toEqual(["1", "2"]);
    expect(page.meta.nextCursor).toBe(encodeCursor(rows[1]!));
    expect(buildCursorPage(rows, 3).meta.nextCursor).toBeNull();
  });
});

describe("cursor pagination against Postgres", () => {
  it("walks every row exactly once in (createdAt desc, id desc) order, ties included", async () => {
    const same = new Date("2026-11-25T09:00:00Z");
    const users = [];
    for (let i = 0; i < 5; i++) users.push(await createUser());
    // Three rows share a timestamp to exercise the id tiebreak.
    const stamps = [same, same, same, new Date("2026-11-25T08:00:00Z"), new Date("2026-11-25T10:00:00Z")];
    for (const [i, u] of users.entries()) {
      await prisma.user.update({ where: { id: u.id }, data: { createdAt: stamps[i] } });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const after = decodeCursor(cursor);
      const rows = await prisma.user.findMany({
        where: afterCursor(after),
        orderBy: cursorOrderBy,
        take: 2 + 1,
        select: { id: true, createdAt: true },
      });
      const page = buildCursorPage(rows, 2, (r) => r.id);
      seen.push(...page.data);
      cursor = page.meta.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);

    const expected = (await prisma.user.findMany({ orderBy: cursorOrderBy, select: { id: true } })).map((u) => u.id);
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);
  });
});
