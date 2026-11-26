// Profile, emergency contacts and alert subscription schemas (appendix-02 2C, 2D; appendix-04 S4, S19, S26, S27).
import { z } from "zod";
import { emailSchema, phoneSchema, text } from "../common.js";

export const MAX_EMERGENCY_CONTACTS = 5;
/** Version recorded in `consents` when a user accepts the Terms and Privacy policy. */
export const TERMS_VERSION = "2026-11-25";

export const fullNameSchema = text(2, 60);

export const emailPrefsSchema = z.object({ saferoute: z.boolean(), automate: z.boolean(), safealert: z.boolean() });
export type EmailPrefs = z.infer<typeof emailPrefsSchema>;
export const DEFAULT_EMAIL_PREFS: EmailPrefs = { saferoute: true, automate: true, safealert: true };

/** PATCH /me. Onboarding sends name + acceptTerms (+ optional phone, alertOptIn, avatarUploadId). */
export const updateMeSchema = z
  .object({
    fullName: fullNameSchema,
    phone: phoneSchema.nullable(),
    /** "I am 18+ and agree to Terms and Privacy" (appendix-04 S4). */
    acceptTerms: z.literal(true, "Confirm you are 18 or older and accept the terms."),
    /** Optional opt-in to community alert notifications (recorded as a consent). */
    alertOptIn: z.boolean(),
    avatarUploadId: z.uuid().nullable(),
    /** Per-module email toggles (appendix-04 S27). Journey safety emails are always sent. */
    emailPrefs: emailPrefsSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type UpdateMe = z.infer<typeof updateMeSchema>;

export const meResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    email: z.string(),
    fullName: z.string().nullable(),
    phone: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    role: z.enum(["USER", "MODERATOR", "ADMIN"]),
    needsOnboarding: z.boolean(),
    alertOptIn: z.boolean(),
    emailPrefs: emailPrefsSchema,
    memberSince: z.string(),
    counts: z.object({ reports: z.number().int(), rides: z.number().int(), contacts: z.number().int() }),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>["data"];

export const emergencyContactInputSchema = z.object({
  name: text(1, 60),
  relationship: text(1, 40).nullable().optional(),
  email: emailSchema,
  phone: phoneSchema.nullable().optional(),
  /** "I have informed this person" (appendix-02 2C). */
  consentConfirmed: z.literal(true, "Confirm you have told this person."),
});
export const emergencyContactUpdateSchema = emergencyContactInputSchema.partial();

export const emergencyContactSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  relationship: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  unsubscribed: z.boolean(),
  createdAt: z.string(),
});
export type EmergencyContactDto = z.infer<typeof emergencyContactSchema>;
export const emergencyContactListSchema = z.object({ data: z.array(emergencyContactSchema) });
export const emergencyContactResponseSchema = z.object({ data: emergencyContactSchema });

export const publicProfileResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    joinedAt: z.string(),
  }),
});
