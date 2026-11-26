// Central error handler: every error leaves as { error: { code, message, details?, requestId } }.
import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ErrorResponse } from "@saferstreets/shared";
import { errors, toAppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(errors.notFound("That route doesn't exist."));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const appErr = toAppError(err);
    const log = (req as { log?: Logger }).log ?? logger;
    if (appErr.status >= 500) log.error({ err, requestId: req.id }, "request failed");
    else log.info({ code: appErr.code, requestId: req.id }, "request rejected");

    // A timeout may already have answered; never write twice.
    if (res.headersSent) return;

    const body: ErrorResponse = {
      error: {
        code: appErr.code,
        message: appErr.message,
        ...(appErr.details && appErr.details.length ? { details: appErr.details } : {}),
        ...(appErr.meta ? { meta: appErr.meta } : {}),
        requestId: String(req.id),
      },
    };
    if (appErr.headers) res.set(appErr.headers);
    res.status(appErr.status).json(body);
  };
}
