// CSRF defence for cookie auth on one origin (Part B2, appendix-07 7.3):
// state-changing requests need X-Requested-With, and a present Origin must be ours.
import type { RequestHandler } from "express";
import { errors } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfGuard(opts: { allowedOrigins: string[]; exemptPaths?: RegExp[] }): RequestHandler {
  const allowed = new Set(opts.allowedOrigins.map((o) => new URL(o).origin));
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (opts.exemptPaths?.some((re) => re.test(req.path))) return next();
    const origin = req.get("origin");
    if (origin && !allowed.has(origin)) return next(errors.forbidden("Cross-site request blocked."));
    if (!req.get("x-requested-with")) return next(errors.forbidden("Missing X-Requested-With header."));
    next();
  };
}
