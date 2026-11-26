// Auth schemas (appendix-04 S2-S3, appendix-07 7.4, appendix-09).
import { z } from "zod";
import { emailSchema } from "../common.js";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;

export const otpRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1, "Complete the check and try again.").max(2048),
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

/** Identical for known and unknown emails (enumeration resistance). */
export const otpRequestResponseSchema = z.object({
  data: z.object({ message: z.string(), resendAfterSeconds: z.number().int() }),
});

export const otpVerifyResponseSchema = z.object({
  data: z.object({
    /** True until the user has set a name and accepted the terms (/welcome). */
    needsOnboarding: z.boolean(),
  }),
});

export const OTP_REQUEST_MESSAGE = "If this email is valid, a code has been sent.";

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export const sessionListResponseSchema = z.object({ data: z.array(sessionSummarySchema) });
