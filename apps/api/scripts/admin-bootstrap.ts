// Creates or promotes the first ADMIN (appendix-03: initial admins are appointed manually).
// Usage: pnpm admin:bootstrap --email you@example.com
// The person then logs in normally with an email code and finishes onboarding.
import { loadEnv } from "../src/config/env.ts";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.ts";

export function parseEmailArg(argv: string[]): string {
  const i = argv.indexOf("--email");
  const raw = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith("--email="))?.slice("--email=".length);
  const email = raw?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Usage: pnpm admin:bootstrap --email you@example.com");
  }
  return email;
}

export async function bootstrapAdmin(prisma: PrismaClient, email: string): Promise<{ created: boolean; id: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && (existing.deletedAt || existing.status === "DELETED" || existing.status === "BANNED")) {
    throw new Error("That account is deleted or banned. Restore it first.");
  }
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN", status: "ACTIVE" } })
    : await prisma.user.create({ data: { email, role: "ADMIN", emailVerifiedAt: new Date() } });
  await prisma.moderationAction.create({
    data: {
      actorId: user.id,
      action: "ROLE_CHANGE",
      targetType: "USER",
      targetId: user.id,
      reason: "First admin bootstrap (script)",
      meta: { role: "ADMIN", via: "admin:bootstrap" },
    },
  });
  return { created: !existing, id: user.id };
}

if (process.argv[1]?.endsWith("admin-bootstrap.ts")) {
  const env = loadEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  try {
    const result = await bootstrapAdmin(prisma, parseEmailArg(process.argv.slice(2)));
    console.log(result.created ? "Created a new ADMIN account." : "Promoted the existing account to ADMIN.");
    console.log("They can now log in with an email code.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
