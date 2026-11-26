// Notification core: one row per notification, mirrored by email through email.send when the user's
// per-module preference allows it (appendix-06 notifications, appendix-07 7.6, Part B3).
import { DEFAULT_EMAIL_PREFS, type EmailPrefs, type NotificationType } from "@saferstreets/shared";
import type { Env } from "../../config/env.js";
import { errors } from "../../lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor } from "../../lib/pagination.js";
import type { Prisma, PrismaClient } from "../../lib/prisma.js";
import type { EmailService } from "../mail/email.service.js";
import { renderNotificationEmail } from "../mail/templates.js";

/** Which email preference governs a notification. JourneyGuard safety emails ignore preferences. */
export type NotificationModule = keyof EmailPrefs | "journeyguard" | "system";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  module: NotificationModule;
  title: string;
  body: string;
  /** In-app path, e.g. /saferoute/<id>. Also used for the email link. */
  link?: string;
  data?: Prisma.InputJsonValue;
  /** Set false to skip the email (the in-app row is still created). */
  email?: boolean;
}

type Db = PrismaClient | Prisma.TransactionClient;

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const toDto = (n: {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

export function createNotificationService(deps: {
  prisma: PrismaClient;
  email: EmailService;
  env: Pick<Env, "APP_ORIGIN">;
}) {
  const { prisma } = deps;

  async function emailAllowed(db: Db, userId: string, module: NotificationModule): Promise<boolean> {
    if (module === "journeyguard" || module === "system") return true;
    const user = await db.user.findUnique({ where: { id: userId }, select: { prefs: true } });
    const prefs = (user?.prefs ?? {}) as { emailPrefs?: Partial<EmailPrefs> };
    return { ...DEFAULT_EMAIL_PREFS, ...prefs.emailPrefs }[module] !== false;
  }

  async function create(db: Db, input: NotifyInput): Promise<{ id: string; flush: () => Promise<void> }> {
    const row = await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 160),
        body: input.body,
        link: input.link ?? null,
        data: input.data ?? {},
      },
    });
    const wantsEmail = input.email !== false && (await emailAllowed(db, input.userId, input.module));
    return {
      id: row.id,
      flush: async () => {
        if (!wantsEmail) return;
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true, status: true },
        });
        if (!user || user.status !== "ACTIVE") return;
        const url = input.link ? new URL(input.link, deps.env.APP_ORIGIN).toString() : undefined;
        await deps.email.enqueue(
          user.email,
          "notification",
          renderNotificationEmail({ title: input.title, body: input.body, ...(url ? { url } : {}) }),
          row.id,
        );
        await prisma.notification.update({ where: { id: row.id }, data: { emailSentAt: new Date() } });
      },
    };
  }

  return {
    /**
     * Inserts the in-app row (inside `tx` when given) and returns `flush`, which queues the email.
     * Call `flush()` AFTER the surrounding transaction commits, so a rollback never sends an email.
     */
    create,

    /** Convenience for callers outside a transaction. */
    async notify(input: NotifyInput): Promise<string> {
      const { id, flush } = await create(prisma, input);
      await flush();
      return id;
    },

    async list(userId: string, q: { cursor?: string | undefined; limit: number; unread?: boolean | undefined }) {
      const rows = await prisma.notification.findMany({
        where: { userId, ...(q.unread ? { readAt: null } : {}), ...afterCursor(decodeCursor(q.cursor)) },
        orderBy: cursorOrderBy,
        take: q.limit + 1,
      });
      return buildCursorPage(rows, q.limit, toDto);
    },

    async unreadCount(userId: string): Promise<number> {
      return prisma.notification.count({ where: { userId, readAt: null } });
    },

    async markRead(userId: string, id: string): Promise<void> {
      // Ownership is in the query: someone else's id is simply "not found".
      const res = await prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      if (res.count === 0) {
        const exists = await prisma.notification.count({ where: { id, userId } });
        if (!exists) throw errors.notFound();
      }
    },

    async markAllRead(userId: string): Promise<number> {
      const res = await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return res.count;
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
