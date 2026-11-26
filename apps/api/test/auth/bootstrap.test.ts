import { describe, expect, it } from "vitest";
import { bootstrapAdmin, parseEmailArg } from "../../scripts/admin-bootstrap.js";
import { createUser, prisma } from "../helpers.js";

describe("admin bootstrap", () => {
  it("parses --email in both forms and rejects bad input", () => {
    expect(parseEmailArg(["--email", "Me@X.com"])).toBe("me@x.com");
    expect(parseEmailArg(["--email=me@x.com"])).toBe("me@x.com");
    expect(() => parseEmailArg([])).toThrow(/Usage/);
    expect(() => parseEmailArg(["--email", "nope"])).toThrow(/Usage/);
  });

  it("creates the first admin and writes an audit entry", async () => {
    const out = await bootstrapAdmin(prisma, "boss@example.test");
    expect(out.created).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "boss@example.test" } });
    expect(user.role).toBe("ADMIN");
    const audit = await prisma.moderationAction.findFirstOrThrow();
    expect(audit).toMatchObject({ actorId: user.id, action: "ROLE_CHANGE", targetId: user.id });
    expect(audit.reason).toContain("bootstrap");
  });

  it("promotes an existing user and is safe to run twice", async () => {
    const u = await createUser({ email: "member@example.test" });
    expect((await bootstrapAdmin(prisma, "member@example.test")).created).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).role).toBe("ADMIN");
    await bootstrapAdmin(prisma, "member@example.test");
    expect(await prisma.user.count()).toBe(1);
  });

  it("refuses to revive deleted or banned accounts", async () => {
    await prisma.user.create({ data: { email: "gone@example.test", status: "DELETED", deletedAt: new Date() } });
    await expect(bootstrapAdmin(prisma, "gone@example.test")).rejects.toThrow(/deleted or banned/);
    await prisma.user.create({ data: { email: "banned@example.test", status: "BANNED" } });
    await expect(bootstrapAdmin(prisma, "banned@example.test")).rejects.toThrow(/deleted or banned/);
  });
});
