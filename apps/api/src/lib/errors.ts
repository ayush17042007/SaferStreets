// AppError and the mapping from any thrown value to the 7.2 error model.
import { ERROR_STATUS, type ErrorCode, type ErrorDetail } from "@saferstreets/shared";
import { ZodError } from "zod";
import { Prisma } from "./prisma.js";

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
    readonly headers?: Record<string, string>,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}

export const errors = {
  validation: (details: ErrorDetail[], message = "Invalid input") => new AppError("VALIDATION_ERROR", message, details),
  unauthenticated: (message = "Log in to continue.") => new AppError("UNAUTHENTICATED", message),
  forbidden: (message = "You don't have access to this.") => new AppError("FORBIDDEN", message),
  notFound: (message = "We couldn't find that.") => new AppError("NOT_FOUND", message),
  conflict: (message = "That conflicts with the current state. Refresh and try again.") =>
    new AppError("CONFLICT", message),
  otpInvalid: (attemptsLeft?: number) =>
    new AppError(
      "OTP_INVALID",
      attemptsLeft === undefined
        ? "That code isn't right. Check it and try again."
        : `That code isn't right. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`,
      undefined,
      undefined,
      attemptsLeft === undefined ? undefined : { attemptsLeft },
    ),
  otpExpired: () => new AppError("OTP_EXPIRED", "That code has expired. Request a new one."),
  otpLocked: () => new AppError("OTP_LOCKED", "Too many wrong codes. Request a new one."),
  serviceUnavailable: (message: string) => new AppError("SERVICE_UNAVAILABLE", message),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError("RATE_LIMITED", `Too many attempts. Try again in ${formatWait(retryAfterSeconds)}.`, undefined, {
      "Retry-After": String(retryAfterSeconds),
    }),
};

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.ceil(seconds / 60)} min`;
}

export function zodDetails(err: ZodError, prefix?: string): ErrorDetail[] {
  return err.issues.map((i) => ({
    field: [prefix, ...i.path.map(String)].filter(Boolean).join("."),
    message: i.message,
  }));
}

/** Map anything thrown into an AppError. Unknown errors become INTERNAL (details never leak). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return errors.validation(zodDetails(err));
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return errors.conflict("That already exists.");
    if (err.code === "P2025") return errors.notFound();
  }
  const e = err as { type?: string; status?: number } | undefined;
  if (e?.type === "entity.too.large") return new AppError("PAYLOAD_TOO_LARGE", "That request is too large.");
  if (e?.type === "entity.parse.failed") return errors.validation([], "The request body isn't valid JSON.");
  return new AppError("INTERNAL", "Something went wrong on our side. Try again.");
}
