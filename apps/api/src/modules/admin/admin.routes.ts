import {
  adminAuditQuerySchema,
  adminFlagsQuerySchema,
  adminQueueQuerySchema,
  adminUserReasonSchema,
  adminUsersQuerySchema,
  changeRoleSchema,
  idParamsSchema,
  resolveFlagSchema,
  settingKeyParamsSchema,
  suspendUserSchema,
  updateSettingSchema,
} from "@saferstreets/shared";
import { z } from "zod";
import { respond, respondRaw } from "../../http/respond.js";
import type { RouteDef } from "../../http/routes.js";
import type { Actor, AdminService } from "./admin.service.js";

const anyBody = z.object({ data: z.unknown() });
type Req = {
  auth?: { userId: string; role: Actor["role"] } | undefined;
  params: unknown;
  body: unknown;
  query: unknown;
};
const actor = (req: Req): Actor => ({ userId: req.auth!.userId, role: req.auth!.role });
const idOf = (req: Req) => (req.params as { id: string }).id;
const q = <T>(req: Req) => req.query as unknown as T;
const b = <T>(req: Req) => req.body as T;
const ok = { 200: { description: "OK", schema: anyBody } };
const idp = { params: idParamsSchema };

export function adminRoutes(service: AdminService): RouteDef[] {
  return [
    {
      method: "get",
      path: "/admin/overview",
      summary: "Counters for the admin home",
      tags: ["admin"],
      auth: "moderator",
      responses: ok,
      handlers: [respond(() => service.overview())],
    },
    {
      method: "get",
      path: "/admin/queue",
      summary: "Moderation queue by tab",
      tags: ["admin"],
      auth: "moderator",
      request: { query: adminQueueQuerySchema },
      responses: { 200: { description: "Page" } },
      handlers: [respondRaw((req) => service.queue(q<{ tab: "reports" }>(req).tab, q(req)))],
    },
    {
      method: "get",
      path: "/admin/flags",
      summary: "Flags by status",
      tags: ["admin"],
      auth: "moderator",
      request: { query: adminFlagsQuerySchema },
      responses: { 200: { description: "Page" } },
      handlers: [respondRaw((req) => service.flags(q(req)))],
    },
    {
      method: "patch",
      path: "/admin/flags/:id",
      summary: "Action or dismiss a flag (note required, audited)",
      tags: ["admin"],
      auth: "moderator",
      request: { ...idp, body: resolveFlagSchema },
      responses: ok,
      handlers: [respond((req) => service.resolveFlag(actor(req), idOf(req), b(req)))],
    },
    {
      method: "get",
      path: "/admin/users",
      summary: "Users (emails masked)",
      tags: ["admin"],
      auth: "moderator",
      request: { query: adminUsersQuerySchema },
      responses: { 200: { description: "Page" } },
      handlers: [respondRaw((req) => service.users(q(req)))],
    },
    {
      method: "post",
      path: "/admin/users/:id/suspend",
      summary: "Suspend until a date (moderators: up to 30 days; revokes sessions)",
      tags: ["admin"],
      auth: "moderator",
      request: { ...idp, body: suspendUserSchema },
      responses: ok,
      handlers: [respond((req) => service.suspend(actor(req), idOf(req), b(req)))],
    },
    {
      method: "post",
      path: "/admin/users/:id/restore",
      summary: "Restore a suspended user (admins also restore bans)",
      tags: ["admin"],
      auth: "moderator",
      request: { ...idp, body: adminUserReasonSchema },
      responses: ok,
      handlers: [respond((req) => service.restore(actor(req), idOf(req), b<{ reason: string }>(req).reason))],
    },
    {
      method: "post",
      path: "/admin/users/:id/ban",
      summary: "Ban a user (admin only; revokes sessions)",
      tags: ["admin"],
      auth: "admin",
      request: { ...idp, body: adminUserReasonSchema },
      responses: ok,
      handlers: [respond((req) => service.ban(actor(req), idOf(req), b<{ reason: string }>(req).reason))],
    },
    {
      method: "patch",
      path: "/admin/users/:id/role",
      summary: "Change a role (admin only)",
      tags: ["admin"],
      auth: "admin",
      request: { ...idp, body: changeRoleSchema },
      responses: ok,
      handlers: [respond((req) => service.changeRole(actor(req), idOf(req), b(req)))],
    },
    {
      method: "get",
      path: "/admin/audit",
      summary: "Append-only audit log",
      tags: ["admin"],
      auth: "admin",
      request: { query: adminAuditQuerySchema },
      responses: { 200: { description: "Page" } },
      handlers: [respondRaw((req) => service.audit(q(req)))],
    },
    {
      method: "get",
      path: "/admin/settings",
      summary: "System settings",
      tags: ["admin"],
      auth: "admin",
      responses: ok,
      handlers: [respond(() => service.getSettings())],
    },
    {
      method: "put",
      path: "/admin/settings/:key",
      summary: "Change a system setting (reason required, audited)",
      tags: ["admin"],
      auth: "admin",
      request: { params: settingKeyParamsSchema, body: updateSettingSchema },
      responses: ok,
      handlers: [
        respond((req) =>
          service.updateSetting(
            actor(req),
            (req.params as { key: "thresholds" }).key,
            b<{ value: unknown }>(req).value,
            b<{ reason: string }>(req).reason,
          ),
        ),
      ],
    },
  ];
}
