// Profile, consents, emergency contacts, sessions list and account deletion (appendix-07 7.4).
import {
  DEFAULT_EMAIL_PREFS,
  MAX_EMERGENCY_CONTACTS,
  TERMS_VERSION,
  type EmailPrefs,
  type MeResponse,
  type UpdateMe,
} from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import { sha256Hex } from "../../lib/hash.js";
import { Prisma, type PrismaClient } from "../../lib/prisma.js";
import type { UploadsService } from "../uploads/uploads.service.js";

/** Stores Indian mobiles as +91XXXXXXXXXX (matches the database CHECK). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(-10);
  return `+91${digits}`;
}

/** "Riya Sharma" -> "Riya S." (first name and last initial, DECISIONS #26). */
export function displayName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SaferStreets member";
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first as string);
}

const contactSelect = {
  id: true,
  name: true,
  relationship: true,
  email: true,
  phone: true,
  unsubscribedAt: true,
  createdAt: true,
} as const;

type ContactRow = Prisma.EmergencyContactGetPayload<{ select: typeof contactSelect }>;

export function toContactDto(c: ContactRow) {
  return {
    id: c.id,
    name: c.name,
    relationship: c.relationship,
    email: c.email,
    phone: c.phone,
    unsubscribed: c.unsubscribedAt !== null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function createUsersService(deps: { prisma: PrismaClient; clock: Clock; uploads: UploadsService }) {
  const { prisma, clock } = deps;

  async function getMe(userId: string): Promise<MeResponse> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw errors.unauthenticated();
    const [reports, rides, contacts] = await Promise.all([
      prisma.report.count({ where: { authorId: userId, deletedAt: null } }),
      prisma.ride.count({ where: { creatorId: userId } }),
      prisma.emergencyContact.count({ where: { userId } }),
    ]);
    const prefs = (user.prefs ?? {}) as { alertOptIn?: boolean; emailPrefs?: Partial<EmailPrefs> };
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      needsOnboarding: !user.fullName || !user.termsAcceptedAt,
      alertOptIn: prefs.alertOptIn === true,
      emailPrefs: { ...DEFAULT_EMAIL_PREFS, ...prefs.emailPrefs },
      memberSince: user.createdAt.toISOString(),
      counts: { reports, rides, contacts },
    };
  }

  async function updateMe(userId: string, input: UpdateMe, ip: string | undefined): Promise<MeResponse> {
    const now = clock.now();
    // Verify the avatar upload first (it calls Cloudinary), then apply everything in one transaction.
    let avatarUrl: string | null | undefined;
    if (input.avatarUploadId) avatarUrl = await deps.uploads.attach(userId, input.avatarUploadId, "AVATAR");
    else if (input.avatarUploadId === null) avatarUrl = null;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw errors.unauthenticated();
      const data: Prisma.UserUpdateInput = {};
      if (input.fullName !== undefined) data.fullName = input.fullName;
      if (input.phone !== undefined) data.phone = input.phone === null ? null : normalizePhone(input.phone);
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
      const ipHash = ip ? sha256Hex(ip) : null;

      if (input.acceptTerms === true && !user.termsAcceptedAt) {
        data.termsAcceptedAt = now;
        await tx.consent.createMany({
          data: (["TERMS", "PRIVACY"] as const).map((type) => ({
            userId,
            type,
            version: TERMS_VERSION,
            acceptedAt: now,
            ipHash,
          })),
        });
      }
      if (input.alertOptIn !== undefined || input.emailPrefs !== undefined) {
        const prefs: Record<string, unknown> = { ...((user.prefs ?? {}) as Record<string, unknown>) };
        if (input.alertOptIn !== undefined) prefs.alertOptIn = input.alertOptIn;
        if (input.emailPrefs !== undefined) prefs.emailPrefs = input.emailPrefs;
        data.prefs = prefs as Prisma.InputJsonValue;
      }
      if (input.alertOptIn !== undefined) {
        if (input.alertOptIn) {
          await tx.consent.create({
            data: { userId, type: "ALERT_OPTIN", version: TERMS_VERSION, acceptedAt: now, ipHash },
          });
        }
      }
      await tx.user.update({ where: { id: userId }, data });
    });
    return getMe(userId);
  }

  /** Soft delete with a 30-day grace period; the PII scrub is the cleanup job (Prompt 12/14). */
  async function deleteMe(userId: string) {
    const now = clock.now();
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { status: "DELETED", deletedAt: now } }),
      prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }

  async function listContacts(userId: string) {
    const rows = await prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: contactSelect,
    });
    return rows.map(toContactDto);
  }

  async function assertNotOwnEmail(userId: string, email: string) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (me && me.email.toLowerCase() === email.toLowerCase()) {
      throw errors.validation([{ field: "email", message: "Use someone else's email, not your own." }]);
    }
  }

  async function createContact(
    userId: string,
    input: { name: string; relationship?: string | null | undefined; email: string; phone?: string | null | undefined },
  ) {
    await assertNotOwnEmail(userId, input.email);
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialise concurrent adds for this user so the limit of 5 cannot be raced.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const count = await tx.emergencyContact.count({ where: { userId } });
        if (count >= MAX_EMERGENCY_CONTACTS) {
          throw errors.conflict(
            `You can save up to ${MAX_EMERGENCY_CONTACTS} trusted contacts. Remove one to add another.`,
          );
        }
        const row = await tx.emergencyContact.create({
          data: {
            userId,
            name: input.name,
            relationship: input.relationship ?? null,
            email: input.email,
            phone: input.phone ? normalizePhone(input.phone) : null,
            consentConfirmed: true,
          },
          select: contactSelect,
        });
        return toContactDto(row);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("You've already added this person.");
      }
      throw err;
    }
  }

  async function updateContact(
    userId: string,
    id: string,
    input: {
      name?: string;
      relationship?: string | null | undefined;
      email?: string;
      phone?: string | null | undefined;
    },
  ) {
    // Ownership is part of the query: someone else's id is simply "not found".
    const existing = await prisma.emergencyContact.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw errors.notFound();
    if (input.email) await assertNotOwnEmail(userId, input.email);
    try {
      const row = await prisma.emergencyContact.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone ? normalizePhone(input.phone) : null } : {}),
        },
        select: contactSelect,
      });
      return toContactDto(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("You've already added this person.");
      }
      throw err;
    }
  }

  async function deleteContact(userId: string, id: string) {
    const res = await prisma.emergencyContact.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw errors.notFound();
  }

  async function listSessions(userId: string, currentSessionId: string) {
    const rows = await prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: clock.now() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  }

  async function publicProfile(id: string) {
    const user = await prisma.user.findFirst({ where: { id, status: "ACTIVE", deletedAt: null } });
    if (!user) throw errors.notFound();
    return {
      id: user.id,
      displayName: displayName(user.fullName),
      avatarUrl: user.avatarUrl,
      joinedAt: user.createdAt.toISOString(),
    };
  }

  return {
    getMe,
    updateMe,
    deleteMe,
    listContacts,
    createContact,
    updateContact,
    deleteContact,
    listSessions,
    publicProfile,
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
