import type { Prisma, PrismaClient } from "../../lib/prisma.js";

export function createSettingsRepository(prisma: PrismaClient) {
  return {
    findAll: () => prisma.systemSetting.findMany({ select: { key: true, value: true } }),
    upsert: (key: string, value: Prisma.InputJsonValue, updatedBy: string | null) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedBy },
        update: { value, updatedBy },
      }),
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
