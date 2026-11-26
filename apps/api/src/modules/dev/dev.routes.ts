// Dev/test helper: read emails written by the `capture` transport (so the e2e flow can read the OTP).
// Only mounted when EMAIL_TRANSPORT=capture, and env validation refuses `capture` in production.
import type { RequestHandler } from "express";
import { z } from "zod";
import type { RouteDef } from "../../http/routes.js";
import type { PrismaClient } from "../../lib/prisma.js";

const query = z.object({ to: z.email() });
const response = z.object({
  data: z.array(z.object({ subject: z.string(), text: z.string(), createdAt: z.string() })),
});

const ageBody = z.object({ email: z.email() });

export function devRoutes(prisma: PrismaClient): RouteDef[] {
  // Lets e2e tests skip the real 60 s resend cooldown by backdating the stored codes.
  const age: RequestHandler = async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof ageBody>;
      const { count } =
        await prisma.$executeRaw`UPDATE otp_codes SET created_at = created_at - interval '2 minutes' WHERE email = ${email}::citext`.then(
          (n) => ({ count: n }),
        );
      res.json({ data: { aged: count } });
    } catch (err) {
      next(err);
    }
  };
  const list: RequestHandler = async (req, res, next) => {
    try {
      const { to } = req.query as unknown as z.infer<typeof query>;
      const rows = await prisma.capturedEmail.findMany({
        where: { toEmail: to },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      res.json({
        data: rows.map((r) => ({ subject: r.subject, text: r.textBody, createdAt: r.createdAt.toISOString() })),
      });
    } catch (err) {
      next(err);
    }
  };
  return [
    {
      method: "post",
      path: "/dev/expire-resend-cooldown",
      summary: "Backdate login codes for an address so the resend cooldown has passed (capture transport only)",
      tags: ["dev"],
      auth: "public",
      request: { body: ageBody },
      responses: { 200: { description: "Number of codes aged" } },
      handlers: [age],
    },
    {
      method: "get",
      path: "/dev/captured-emails",
      summary: "Captured emails for an address (capture transport only, never production)",
      tags: ["dev"],
      auth: "public",
      request: { query },
      responses: { 200: { description: "Latest captured emails", schema: response } },
      handlers: [list],
    },
  ];
}
