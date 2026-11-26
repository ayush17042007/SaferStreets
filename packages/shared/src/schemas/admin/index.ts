// Admin and moderation schemas (appendix-03, appendix-07 7.4, appendix-04 S28-S33). Endpoints arrive in Prompt 10.
import { z } from "zod";
import { FlagTargetType, UserRole } from "../../enums.js";
import { text, uuidSchema } from "../common.js";

/** Every admin action carries a reason (Part B6). */
export const reasonSchema = text(3, 500);

export const createFlagSchema = z.object({
  targetType: FlagTargetType.schema,
  targetId: uuidSchema,
  reason: text(3, 300),
});

export const suspendUserSchema = z.object({
  reason: reasonSchema,
  until: z.iso.datetime({ offset: true }),
});

export const changeRoleSchema = z.object({
  role: UserRole.schema,
  reason: reasonSchema,
});

export const MAX_SUSPENSION_DAYS = 30;

export const adminQueueQuerySchema = z.object({
  tab: z.enum(["reports", "alerts", "rides", "users"]),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminFlagsQuerySchema = z.object({
  status: z.enum(["OPEN", "ACTIONED", "DISMISSED"]).default("OPEN"),
  targetType: FlagTargetType.schema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const resolveFlagSchema = z.object({
  status: z.enum(["ACTIONED", "DISMISSED"]),
  note: text(3, 500),
});

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
  role: UserRole.schema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminUserReasonSchema = z.object({ reason: reasonSchema });

export const adminAuditQuerySchema = z.object({
  action: z.string().max(32).optional(),
  actorId: uuidSchema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const settingKeyParamsSchema = z.object({ key: z.enum(["serviceRegion", "emergencyNumbers", "thresholds"]) });
export const updateSettingSchema = z.object({ value: z.unknown(), reason: reasonSchema });

export interface AdminOverviewDto {
  reportsToReview: number;
  alertsToReview: number;
  openFlags: number;
  activeAlerts: number;
  openRides: number;
  activeJourneys: number;
  usersTotal: number;
  usersSuspended: number;
}

export interface AdminQueueItemDto {
  id: string;
  kind: "report" | "alert" | "ride" | "user";
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  openFlags: number;
}

export interface AdminFlagDto {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  resolutionNote: string | null;
}

export interface AdminUserDto {
  id: string;
  name: string;
  /** Masked: the admin tables never show a full email address. */
  emailMasked: string;
  role: string;
  status: string;
  strikeCount: number;
  suspendedUntil: string | null;
  createdAt: string;
}

export interface AdminAuditDto {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  createdAt: string;
}
