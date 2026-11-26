// Request timeout (Part B1). Answers 503 if the handler hasn't responded in time.
import type { RequestHandler } from "express";
import { AppError } from "../lib/errors.js";

export function requestTimeout(ms: number): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) next(new AppError("SERVICE_UNAVAILABLE", "That took too long. Try again."));
    }, ms);
    timer.unref();
    const clear = () => clearTimeout(timer);
    res.on("finish", clear);
    res.on("close", clear);
    next();
  };
}
