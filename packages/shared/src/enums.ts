// All database enums (appendix-06 6.1 + Part B4). Values must match apps/api/prisma/schema.prisma
// exactly; apps/api/test/schema/enums.test.ts enforces that.
import { z } from "zod";

function defineEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const obj = Object.fromEntries(values.map((v) => [v, v])) as { readonly [K in T[number]]: K };
  return Object.assign(obj, { values, schema: z.enum(values) });
}

// --- appendix-06 6.1 ---
export const UserRole = defineEnum(["USER", "MODERATOR", "ADMIN"]);
export const UserStatus = defineEnum(["ACTIVE", "SUSPENDED", "BANNED", "DELETED"]);
export const ReportCategory = defineEnum([
  "BROKEN_STREETLIGHT",
  "POOR_LIGHTING",
  "POTHOLE",
  "DAMAGED_ROAD",
  "DAMAGED_FOOTPATH",
  "ISOLATED_AREA",
  "OTHER",
]);
export const ReportStatus = defineEnum([
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
]);
export const RideStatus = defineEnum(["OPEN", "FULL", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
export const RideRequestStatus = defineEnum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"]);
export const JourneyStatus = defineEnum(["ACTIVE", "OVERDUE", "COMPLETED", "CANCELLED"]);
export const AlertCategory = defineEnum(["ROAD_ACCIDENT", "MEDICAL", "HARASSMENT", "FIRE", "PUBLIC_HAZARD", "OTHER"]);
export const AlertStatus = defineEnum(["ACTIVE", "VERIFIED", "RESOLVED", "DISMISSED", "EXPIRED", "REMOVED"]);
export const NotificationType = defineEnum([
  "REPORT_STATUS",
  "REPORT_CONFIRMED",
  "RIDE_REQUEST",
  "RIDE_DECISION",
  "RIDE_UPDATE",
  "RIDE_MESSAGE",
  "JOURNEY_REMINDER",
  "JOURNEY_OVERDUE",
  "ALERT_NEARBY",
  "ALERT_UPDATE",
  "MODERATION",
  "SYSTEM",
]);
export const FlagTargetType = defineEnum(["REPORT", "RIDE", "ALERT", "USER", "RIDE_MESSAGE"]);
export const FlagStatus = defineEnum(["OPEN", "ACTIONED", "DISMISSED"]);

// --- enums named inline in appendix-06 6.2 ---
export const JourneyEventType = defineEnum([
  "STARTED",
  "EXTENDED",
  "REMINDER_SENT",
  "CONTACT_NOTIFIED",
  "COMPLETED",
  "CANCELLED",
  "DEVIATED",
  "STOPPED",
  "LOST_SIGNAL",
  "SOS_TRIGGERED",
]);
export const AlertVoteType = defineEnum(["CONFIRM", "DISPUTE"]);
/** 6.2 lists "VERIFY, REJECT, REMOVE, SUSPEND, BAN, ROLE_CHANGE, STRIKE, etc."; the rest come from A5.10 and 7.4 admin actions. */
export const ModerationActionType = defineEnum([
  "VERIFY",
  "REJECT",
  "RESOLVE",
  "DISMISS",
  "REMOVE",
  "WARN",
  "STRIKE",
  "SUSPEND",
  "BAN",
  "RESTORE",
  "ROLE_CHANGE",
  "SETTINGS_CHANGE",
  "FLAG_RESOLVE",
  "STATUS_CHANGE",
]);

// --- Part B4 ---
export const UploadPurpose = defineEnum(["REPORT", "ALERT", "AVATAR"]);
export const UploadStatus = defineEnum(["PENDING", "ATTACHED", "ORPHANED"]);
export const EmailEventStatus = defineEnum(["QUEUED", "SENT", "DELIVERED", "BOUNCED", "COMPLAINED", "FAILED"]);
export const EmailSuppressionReason = defineEnum(["BOUNCED", "COMPLAINED", "UNSUBSCRIBED"]);
export const ConsentType = defineEnum(["TERMS", "PRIVACY", "ALERT_OPTIN"]);

/** Every enum by its Prisma name, for the schema parity test. */
export const ALL_ENUMS = {
  UserRole,
  UserStatus,
  ReportCategory,
  ReportStatus,
  RideStatus,
  RideRequestStatus,
  JourneyStatus,
  AlertCategory,
  AlertStatus,
  NotificationType,
  FlagTargetType,
  FlagStatus,
  JourneyEventType,
  AlertVoteType,
  ModerationActionType,
  UploadPurpose,
  UploadStatus,
  EmailEventStatus,
  EmailSuppressionReason,
  ConsentType,
} as const;

export type UserRole = (typeof UserRole.values)[number];
export type UserStatus = (typeof UserStatus.values)[number];
export type ReportCategory = (typeof ReportCategory.values)[number];
export type ReportStatus = (typeof ReportStatus.values)[number];
export type RideStatus = (typeof RideStatus.values)[number];
export type RideRequestStatus = (typeof RideRequestStatus.values)[number];
export type JourneyStatus = (typeof JourneyStatus.values)[number];
export type AlertCategory = (typeof AlertCategory.values)[number];
export type AlertStatus = (typeof AlertStatus.values)[number];
export type NotificationType = (typeof NotificationType.values)[number];
export type FlagTargetType = (typeof FlagTargetType.values)[number];
export type FlagStatus = (typeof FlagStatus.values)[number];
export type JourneyEventType = (typeof JourneyEventType.values)[number];
export type AlertVoteType = (typeof AlertVoteType.values)[number];
export type ModerationActionType = (typeof ModerationActionType.values)[number];
export type UploadPurpose = (typeof UploadPurpose.values)[number];
export type UploadStatus = (typeof UploadStatus.values)[number];
export type EmailEventStatus = (typeof EmailEventStatus.values)[number];
export type EmailSuppressionReason = (typeof EmailSuppressionReason.values)[number];
export type ConsentType = (typeof ConsentType.values)[number];
