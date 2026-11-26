import type { Request, RequestHandler } from "express";

/** Wraps a service call: `{ data }` on success, errors to the central handler. */
export function respond(fn: (req: Request) => Promise<unknown>, status = 200): RequestHandler {
  return async (req, res, next) => {
    try {
      res.status(status).json({ data: await fn(req) });
    } catch (err) {
      next(err);
    }
  };
}

/** Same, but the payload is the whole body (for { data, meta } pages). */
export function respondRaw(fn: (req: Request) => Promise<unknown>, status = 200): RequestHandler {
  return async (req, res, next) => {
    try {
      res.status(status).json(await fn(req));
    } catch (err) {
      next(err);
    }
  };
}
