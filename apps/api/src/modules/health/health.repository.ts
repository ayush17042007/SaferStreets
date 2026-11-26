import type { PrismaClient } from "../../lib/prisma.js";

export function createHealthRepository(prisma: PrismaClient) {
  return {
    async ping(): Promise<void> {
      await prisma.$queryRaw`SELECT 1`;
    },
    async appliedMigrations(): Promise<string[]> {
      const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      return rows.map((r) => r.migration_name);
    },
    async heartbeat(name: string): Promise<Date | null> {
      const row = await prisma.heartbeat.findUnique({ where: { name }, select: { lastSeenAt: true } });
      return row?.lastSeenAt ?? null;
    },
  };
}

export type HealthRepository = ReturnType<typeof createHealthRepository>;
