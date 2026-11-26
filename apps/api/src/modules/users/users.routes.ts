import {
  emergencyContactInputSchema,
  emergencyContactListSchema,
  emergencyContactResponseSchema,
  emergencyContactUpdateSchema,
  idParamsSchema,
  meResponseSchema,
  publicProfileResponseSchema,
  sessionListResponseSchema,
  updateMeSchema,
  type UpdateMe,
} from "@saferstreets/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { RouteDef } from "../../http/routes.js";
import { clearSessionCookie } from "../auth/session.js";
import type { UsersService } from "./users.service.js";

const okSchema = z.object({ data: z.object({ ok: z.literal(true) }) });

type Handler = (req: Parameters<RequestHandler>[0]) => Promise<unknown>;

/** Wraps a service call: `{ data }` on success, errors to the central handler. */
function respond(fn: Handler, status = 200): RequestHandler {
  return async (req, res, next) => {
    try {
      const data = await fn(req);
      res.status(status).json({ data });
    } catch (err) {
      next(err);
    }
  };
}

export function usersRoutes(deps: { service: UsersService; env: Env }): RouteDef[] {
  const { service, env } = deps;
  const uid = (req: Parameters<RequestHandler>[0]) => req.auth!.userId;
  const idParam = (req: Parameters<RequestHandler>[0]) => (req.params as { id: string }).id;

  const deleteMe: RequestHandler = async (req, res, next) => {
    try {
      await service.deleteMe(uid(req));
      clearSessionCookie(res, env);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  };

  return [
    {
      method: "get",
      path: "/me",
      summary: "Current user with counts",
      tags: ["users"],
      auth: "user",
      responses: { 200: { description: "Profile", schema: meResponseSchema } },
      handlers: [respond((req) => service.getMe(uid(req)))],
    },
    {
      method: "patch",
      path: "/me",
      summary: "Update name, phone, alert opt-in, terms acceptance or avatar",
      tags: ["users"],
      auth: "user",
      request: { body: updateMeSchema },
      responses: { 200: { description: "Updated profile", schema: meResponseSchema } },
      handlers: [respond((req) => service.updateMe(uid(req), req.body as UpdateMe, req.ip))],
    },
    {
      method: "delete",
      path: "/me",
      summary: "Delete my account (soft delete, 30-day grace, sessions revoked)",
      tags: ["users"],
      auth: "user",
      responses: { 200: { description: "Account scheduled for deletion", schema: okSchema } },
      handlers: [deleteMe],
    },
    {
      method: "get",
      path: "/me/sessions",
      summary: "My active sessions",
      tags: ["users"],
      auth: "user",
      responses: { 200: { description: "Sessions", schema: sessionListResponseSchema } },
      handlers: [respond((req) => service.listSessions(uid(req), req.auth!.sessionId))],
    },
    {
      method: "get",
      path: "/me/contacts",
      summary: "My emergency contacts",
      tags: ["contacts"],
      auth: "user",
      responses: { 200: { description: "Contacts", schema: emergencyContactListSchema } },
      handlers: [respond((req) => service.listContacts(uid(req)))],
    },
    {
      method: "post",
      path: "/me/contacts",
      summary: "Add an emergency contact (max 5, consent required)",
      tags: ["contacts"],
      auth: "user",
      request: { body: emergencyContactInputSchema },
      responses: {
        201: { description: "Created", schema: emergencyContactResponseSchema },
        409: { description: "Limit reached or duplicate" },
      },
      handlers: [
        respond(
          (req) =>
            service.createContact(
              uid(req),
              req.body as { name: string; relationship?: string | null; email: string; phone?: string | null },
            ),
          201,
        ),
      ],
    },
    {
      method: "patch",
      path: "/me/contacts/:id",
      summary: "Edit an emergency contact",
      tags: ["contacts"],
      auth: "user",
      request: { params: idParamsSchema, body: emergencyContactUpdateSchema },
      responses: { 200: { description: "Updated", schema: emergencyContactResponseSchema } },
      handlers: [
        respond((req) =>
          service.updateContact(
            uid(req),
            idParam(req),
            req.body as { name?: string; relationship?: string | null; email?: string; phone?: string | null },
          ),
        ),
      ],
    },
    {
      method: "delete",
      path: "/me/contacts/:id",
      summary: "Remove an emergency contact",
      tags: ["contacts"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Removed", schema: okSchema } },
      handlers: [
        respond(async (req) => {
          await service.deleteContact(uid(req), idParam(req));
          return { ok: true };
        }),
      ],
    },
    {
      method: "get",
      path: "/users/:id/public",
      summary: "Public profile: display name, avatar, joined date",
      tags: ["users"],
      auth: "user",
      request: { params: idParamsSchema },
      responses: { 200: { description: "Public profile", schema: publicProfileResponseSchema } },
      handlers: [respond((req) => service.publicProfile(idParam(req)))],
    },
  ];
}
