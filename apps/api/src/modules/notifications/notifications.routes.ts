import { cursorQuerySchema, idParamsSchema } from "@saferstreets/shared";
import { z } from "zod";
import { respond, respondRaw } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import type { NotificationService } from "./notifications.service.js";

const listQuery = cursorQuerySchema.extend({
  unread: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
const anyBody = z.object({ data: z.unknown() });

export function notificationsRoutes(service: NotificationService): RouteDef[] {
  const uid = (req: { auth?: { userId: string } | undefined }) => req.auth!.userId;
  return [
    {
      method: "get",
      path: "/notifications",
      summary: "My notifications (cursor pagination)",
      tags: ["notifications"],
      auth: "user",
      request: { query: listQuery },
      responses: { 200: { description: "Page of notifications" } },
      handlers: [respondRaw((req) => service.list(uid(req), req.query as unknown as z.infer<typeof listQuery>))],
    },
    {
      method: "get",
      path: "/notifications/unread-count",
      summary: "Unread badge count",
      tags: ["notifications"],
      auth: "user",
      responses: { 200: { description: "Count", schema: anyBody } },
      handlers: [respond(async (req) => ({ count: await service.unreadCount(uid(req)) }))],
    },
    {
      method: "patch",
      path: "/notifications/:id/read",
      summary: "Mark one notification read",
      tags: ["notifications"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Marked", schema: anyBody } },
      handlers: [
        respond(async (req) => {
          await service.markRead(uid(req), (req.params as { id: string }).id);
          return { ok: true };
        }),
      ],
    },
    {
      method: "post",
      path: "/notifications/read-all",
      summary: "Mark every notification read",
      tags: ["notifications"],
      auth: "user",
      responses: { 200: { description: "Marked", schema: anyBody } },
      handlers: [respond(async (req) => ({ updated: await service.markAllRead(uid(req)) }))],
    },
  ];
}
