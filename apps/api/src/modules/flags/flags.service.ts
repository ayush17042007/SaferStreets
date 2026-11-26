// User flags on content (appendix-06 flags). Reviewing them is the admin UI (M5).
import type { FlagTargetType } from "@saferstreets/shared";
import { errors } from "../../lib/errors.js";
import { Prisma, type PrismaClient } from "../../lib/prisma.js";

export function createFlagsService(deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  /** flags.target_id has no database FK (polymorphic), so existence is checked here. */
  async function exists(type: FlagTargetType, id: string, reporterId: string): Promise<boolean> {
    switch (type) {
      case "REPORT":
        return (await prisma.report.count({ where: { id, deletedAt: null } })) > 0;
      case "RIDE":
        return (await prisma.ride.count({ where: { id } })) > 0;
      case "ALERT":
        return (await prisma.alert.count({ where: { id } })) > 0;
      case "USER":
        return id !== reporterId && (await prisma.user.count({ where: { id, deletedAt: null } })) > 0;
      case "RIDE_MESSAGE":
        return false; // ride chat is not built
    }
  }

  return {
    async create(reporterId: string, input: { targetType: FlagTargetType; targetId: string; reason: string }) {
      if (!(await exists(input.targetType, input.targetId, reporterId)))
        throw errors.notFound("We couldn't find that to flag.");
      try {
        const flag = await prisma.flag.create({
          data: { reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason },
        });
        return { id: flag.id };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw errors.conflict("You've already flagged this.");
        }
        throw err;
      }
    },
  };
}

export type FlagsService = ReturnType<typeof createFlagsService>;
