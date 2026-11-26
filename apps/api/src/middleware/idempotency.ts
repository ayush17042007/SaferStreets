// Idempotency-Key support (Part B5) backed by idempotency_keys.
// - same key + same method/path/body  -> the original response is replayed
// - same key + different request      -> 422 IDEMPOTENCY_MISMATCH
// - same key while the first is still running -> 409 CONFLICT
// Only 2xx responses are stored; on any error the key is released so the client can retry.
// Use after requireAuth: keys are scoped per user.
import type { RequestHandler } from "express";
import { AppError, errors } from "../lib/errors.js";
import { sha256Hex, stableStringify } from "../lib/hash.js";
import type { Clock } from "../lib/clock.js";
import { Prisma, type PrismaClient } from "../lib/prisma.js";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;

export function idempotency(deps: { prisma: PrismaClient; clock: Clock }): RequestHandler {
  const { prisma, clock } = deps;
  return async (req, res, next) => {
    const key = req.get("idempotency-key");
    if (key === undefined) return next();
    try {
      if (!KEY_PATTERN.test(key)) {
        throw errors.validation([{ field: "Idempotency-Key", message: "Use 8-255 letters, digits or -_.:" }]);
      }
      if (!req.auth) throw errors.unauthenticated();
      const userId = req.auth.userId;
      const method = req.method;
      const path = req.originalUrl.split("?")[0] ?? req.path;
      const requestHash = sha256Hex(`${method} ${path}\n${stableStringify(req.body ?? null)}`);
      const now = clock.now();

      const existing = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
      if (existing && existing.expiresAt <= now) {
        await prisma.idempotencyKey.deleteMany({ where: { id: existing.id } });
      } else if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError("IDEMPOTENCY_MISMATCH", "This Idempotency-Key was already used for a different request.");
        }
        if (existing.responseStatus === null) {
          throw errors.conflict("The original request with this Idempotency-Key is still in progress.");
        }
        res.setHeader("Idempotent-Replayed", "true");
        return res.status(existing.responseStatus).json(existing.responseBody);
      }

      let record;
      try {
        record = await prisma.idempotencyKey.create({
          data: { key, userId, method, path, requestHash, expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS) },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw errors.conflict("The original request with this Idempotency-Key is still in progress.");
        }
        throw err;
      }

      // Persist (2xx) or release (anything else) BEFORE the response is written, so a retry
      // that arrives right after the client sees the response always finds a settled record.
      let settled = false;
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        settled = true;
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        const op = ok
          ? prisma.idempotencyKey.update({
              where: { id: record.id },
              data: { responseStatus: res.statusCode, responseBody: (body ?? null) as Prisma.InputJsonValue },
            })
          : prisma.idempotencyKey.deleteMany({ where: { id: record.id } });
        op.then(
          () => originalJson(body),
          (err: unknown) => {
            req.log?.error({ err }, "idempotency record update failed");
            originalJson(body);
          },
        );
        return res;
      };
      // Non-JSON or aborted responses: release the key.
      res.on("close", () => {
        if (!settled) {
          prisma.idempotencyKey
            .deleteMany({ where: { id: record.id } })
            .catch((err: unknown) => req.log?.error({ err }, "idempotency release failed"));
        }
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}
