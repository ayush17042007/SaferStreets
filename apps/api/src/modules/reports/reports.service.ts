// SafeRoute reports (appendix-02 2A). Business rules live here; routes only validate and respond.
import {
  DUPLICATE_RADIUS_M,
  bboxAround,
  haversineKm,
  haversineMeters,
  inRegion,
  type CreateReport,
  type DuplicateDto,
  type EditReportInput,
  type ListReportsQuery,
  type ReportCardDto,
  type ReportDetailDto,
  type ReportStatusChange,
} from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import { afterCursor, buildCursorPage, cursorOrderBy, decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { Prisma, type PrismaClient } from "../../lib/prisma.js";
import type { NotificationService } from "../notifications/notifications.service.js";
import type { SettingsService } from "../settings/settings.service.js";
import type { UploadsService } from "../uploads/uploads.service.js";

export interface Viewer {
  userId?: string | undefined;
  role?: "USER" | "MODERATOR" | "ADMIN" | undefined;
}

type Status = "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

/** appendix-02 2A state machine. Only moderators and admins move a report. */
export const REPORT_TRANSITIONS: Record<Status, readonly Status[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["VERIFIED"], // reopened with new evidence
  REJECTED: [],
};

export const CATEGORY_LABEL: Record<string, string> = {
  BROKEN_STREETLIGHT: "Broken streetlight",
  POOR_LIGHTING: "Poor lighting",
  POTHOLE: "Pothole",
  DAMAGED_ROAD: "Damaged road",
  DAMAGED_FOOTPATH: "Damaged footpath",
  ISOLATED_AREA: "Isolated area",
  OTHER: "Other",
};

const STATUS_TITLE: Record<Status, string> = {
  SUBMITTED: "Your report was submitted",
  UNDER_REVIEW: "Your report is being reviewed",
  VERIFIED: "Your report was verified",
  IN_PROGRESS: "Work has started on your report",
  RESOLVED: "Your report was resolved",
  REJECTED: "Your report was rejected",
};

const AUDIT_ACTION = { VERIFIED: "VERIFY", REJECTED: "REJECT", RESOLVED: "RESOLVE" } as const;

const isStaff = (v: Viewer) => v.role === "MODERATOR" || v.role === "ADMIN";
const num = (d: { toString(): string } | number) => Number(d);

type ReportRow = Prisma.ReportGetPayload<{ include: { photos: true } }>;

export function createReportsService(deps: {
  prisma: PrismaClient;
  clock: Clock;
  settings: SettingsService;
  uploads: UploadsService;
  notifications: NotificationService;
}) {
  const { prisma } = deps;

  /** Public sees everything but rejected; owners also see their own rejected ones; staff see all. */
  function visibleTo(v: Viewer): Prisma.ReportWhereInput {
    if (isStaff(v)) return { deletedAt: null };
    if (v.userId) return { deletedAt: null, OR: [{ status: { not: "REJECTED" } }, { authorId: v.userId }] };
    return { deletedAt: null, status: { not: "REJECTED" } };
  }

  function card(r: ReportRow, v: Viewer, threshold: number, distanceKm?: number): ReportCardDto {
    const first = [...r.photos].sort((a, b) => a.position - b.position)[0];
    return {
      id: r.id,
      category: r.category,
      title: r.title,
      addressText: r.addressText,
      status: r.status,
      confirmationCount: r.confirmationCount,
      communityConfirmed: r.confirmationCount >= threshold,
      latitude: num(r.latitude),
      longitude: num(r.longitude),
      createdAt: r.createdAt.toISOString(),
      ...(distanceKm !== undefined ? { distanceKm: Math.round(distanceKm * 10) / 10 } : {}),
      photoUrl: first?.url ?? null,
      isMine: v.userId !== undefined && r.authorId === v.userId,
    };
  }

  async function threshold(): Promise<number> {
    return (await deps.settings.get("thresholds")).reportConfirmations;
  }

  async function detail(id: string, v: Viewer): Promise<ReportDetailDto> {
    const r = await prisma.report.findFirst({
      where: { id, ...visibleTo(v) },
      include: {
        photos: true,
        author: { select: { id: true, fullName: true } },
        statusHistory: { orderBy: { createdAt: "desc" }, include: { author: { select: { fullName: true } } } },
      },
    });
    if (!r) throw errors.notFound("We couldn't find that report.");
    const t = await threshold();
    const mine = v.userId === r.authorId;
    const confirmed = v.userId
      ? (await prisma.reportConfirmation.count({ where: { reportId: id, userId: v.userId } })) > 0
      : false;
    const staff = isStaff(v);
    return {
      ...card(r, v, t),
      description: r.description,
      photos: [...r.photos]
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ url: p.url, alt: `Photo of ${CATEGORY_LABEL[r.category]?.toLowerCase() ?? "the issue"}` })),
      version: r.version,
      confirmedByMe: confirmed,
      canEdit: mine && r.status === "SUBMITTED",
      canConfirm: Boolean(v.userId) && !mine && r.status !== "REJECTED" && r.status !== "RESOLVED",
      moderatorNote: r.moderatorNote,
      history: r.statusHistory.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        // Reasons given on a decision are shown to the author and staff; the public sees the status only.
        note: mine || staff ? h.note : null,
        createdAt: h.createdAt.toISOString(),
        ...(staff ? { by: h.author.fullName ?? "Moderator" } : {}),
      })),
      ...(staff ? { author: { id: r.author.id, name: r.author.fullName } } : {}),
    };
  }

  return {
    detail,

    async create(userId: string, input: CreateReport): Promise<ReportDetailDto> {
      const region = await deps.settings.get("serviceRegion");
      if (!inRegion({ lat: input.latitude, lng: input.longitude }, region)) {
        throw errors.validation([
          { field: "body.latitude", message: "That spot is outside the service area. Move the pin inside it." },
        ]);
      }
      // Re-validate every photo with storage (type, size) before anything is saved.
      const photos: Array<{ url: string; storageKey: string; uploadId: string }> = [];
      for (const uploadId of input.photoUploadIds) {
        const url = await deps.uploads.attach(userId, uploadId, "REPORT");
        const up = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
        photos.push({ url, storageKey: up.storageKey, uploadId });
      }
      const created = await prisma.report.create({
        data: {
          authorId: userId,
          category: input.category,
          title: input.title,
          description: input.description,
          latitude: input.latitude,
          longitude: input.longitude,
          addressText: input.addressText ?? null,
          photos: { create: photos.map((p, i) => ({ url: p.url, storageKey: p.storageKey, position: i })) },
          statusHistory: { create: { fromStatus: null, toStatus: "SUBMITTED", changedBy: userId } },
        },
      });
      return detail(created.id, { userId, role: "USER" });
    },

    async list(v: Viewer, q: ListReportsQuery) {
      if (q.mine && !v.userId) throw errors.unauthenticated();
      const t = await threshold();
      const center = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
      const radius = center ? (q.radius ?? 5) : null;
      const box = center && radius ? bboxAround(center, radius) : null;

      const base: Prisma.ReportWhereInput = {
        AND: [
          visibleTo(v),
          {
            ...(q.mine ? { authorId: v.userId as string } : {}),
            ...(q.category ? { category: q.category } : {}),
            ...(q.status ? { status: q.status } : {}),
            ...(q.from || q.to
              ? {
                  createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) },
                }
              : {}),
            ...(box
              ? {
                  latitude: { gte: box.minLat, lte: box.maxLat },
                  longitude: { gte: box.minLng, lte: box.maxLng },
                }
              : {}),
          },
        ],
      };

      // With a radius the bounding box over-selects; keep fetching batches until the page is full.
      const out: Array<{ row: ReportRow; km?: number }> = [];
      let cursor = decodeCursor(q.cursor);
      let exhausted = false;
      for (let round = 0; round < 6 && out.length < q.limit + 1 && !exhausted; round++) {
        const rows = await prisma.report.findMany({
          where: { AND: [base, afterCursor(cursor)] },
          orderBy: cursorOrderBy,
          take: box ? 100 : q.limit + 1,
          include: { photos: true },
        });
        if (rows.length === 0) break;
        for (const row of rows) {
          if (center && radius) {
            const km = haversineKm(center, { lat: num(row.latitude), lng: num(row.longitude) });
            if (km > radius) continue;
            out.push({ row, km });
          } else out.push({ row });
          if (out.length >= q.limit + 1) break;
        }
        const last = rows[rows.length - 1]!;
        cursor = { createdAt: last.createdAt, id: last.id };
        exhausted = rows.length < (box ? 100 : q.limit + 1);
      }
      const page = buildCursorPage(
        out.map((o) => ({ ...o.row, _km: o.km })),
        q.limit,
        (r) => card(r, v, t, r._km),
      );
      // The cursor must follow the last item returned, not the last row fetched.
      if (page.meta.nextCursor) {
        const lastShown = out[q.limit - 1]!.row;
        page.meta.nextCursor = encodeCursor({ createdAt: lastShown.createdAt, id: lastShown.id });
      }
      return page;
    },

    async nearbyDuplicates(center: { lat: number; lng: number }, category: string): Promise<DuplicateDto[]> {
      const box = bboxAround(center, DUPLICATE_RADIUS_M / 1000);
      const rows = await prisma.report.findMany({
        where: {
          deletedAt: null,
          category: category as ReportRow["category"],
          status: { in: ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "IN_PROGRESS"] },
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLng, lte: box.maxLng },
        },
        take: 50,
      });
      return rows
        .map((r) => ({ r, m: haversineMeters(center, { lat: num(r.latitude), lng: num(r.longitude) }) }))
        .filter((x) => x.m <= DUPLICATE_RADIUS_M)
        .sort((a, b) => a.m - b.m)
        .slice(0, 3)
        .map(({ r, m }) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          distanceM: Math.max(10, Math.round(m / 10) * 10),
          confirmationCount: r.confirmationCount,
        }));
    },

    async edit(userId: string, id: string, input: EditReportInput): Promise<ReportDetailDto> {
      const existing = await prisma.report.findFirst({ where: { id, authorId: userId, deletedAt: null } });
      if (!existing) throw errors.notFound("We couldn't find that report.");
      if (existing.status !== "SUBMITTED") {
        throw errors.conflict("Only reports that haven't been reviewed yet can be edited.");
      }
      const res = await prisma.report.updateMany({
        where: { id, authorId: userId, status: "SUBMITTED", version: input.version, deletedAt: null },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.addressText !== undefined ? { addressText: input.addressText } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw errors.conflict("This report changed while you were editing. Refresh and try again.");
      return detail(id, { userId, role: "USER" });
    },

    async remove(userId: string, id: string): Promise<void> {
      const existing = await prisma.report.findFirst({ where: { id, authorId: userId, deletedAt: null } });
      if (!existing) throw errors.notFound("We couldn't find that report.");
      if (existing.status !== "SUBMITTED") {
        throw errors.conflict("Only reports that haven't been reviewed yet can be deleted.");
      }
      const res = await prisma.report.updateMany({
        where: { id, authorId: userId, status: "SUBMITTED" },
        data: { deletedAt: deps.clock.now() },
      });
      if (res.count === 0)
        throw errors.conflict("This report changed while you were deleting it. Refresh and try again.");
    },

    async confirm(userId: string, id: string) {
      const r = await prisma.report.findFirst({ where: { id, ...visibleTo({ userId, role: "USER" }) } });
      if (!r) throw errors.notFound("We couldn't find that report.");
      if (r.authorId === userId) throw errors.forbidden("You can't confirm your own report.");
      if (r.status === "REJECTED" || r.status === "RESOLVED") {
        throw errors.conflict("This report is closed, so it can't be confirmed.");
      }
      const t = await threshold();
      let flush: (() => Promise<void>) | undefined;
      let count: number;
      try {
        count = await prisma.$transaction(async (tx) => {
          await tx.reportConfirmation.create({ data: { reportId: id, userId } });
          const updated = await tx.report.update({
            where: { id },
            data: { confirmationCount: { increment: 1 } },
            select: { confirmationCount: true },
          });
          // Reaching the threshold marks it "Community-confirmed" and tells the author. It never auto-verifies.
          if (updated.confirmationCount === t) {
            const n = await deps.notifications.create(tx, {
              userId: r.authorId,
              type: "REPORT_CONFIRMED",
              module: "saferoute",
              title: "Neighbours confirmed your report",
              body: `${t} people confirmed "${r.title}". A moderator will review it.`,
              link: `/saferoute/${id}`,
            });
            flush = n.flush;
          }
          return updated.confirmationCount;
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw errors.conflict("You've already confirmed this report.");
        }
        throw err;
      }
      await flush?.();
      return { confirmationCount: count, confirmedByMe: true, communityConfirmed: count >= t };
    },

    async unconfirm(userId: string, id: string) {
      const t = await threshold();
      const count = await prisma.$transaction(async (tx) => {
        const del = await tx.reportConfirmation.deleteMany({ where: { reportId: id, userId } });
        if (del.count === 0) throw errors.notFound("You haven't confirmed this report.");
        const updated = await tx.report.update({
          where: { id },
          data: { confirmationCount: { decrement: 1 } },
          select: { confirmationCount: true },
        });
        return updated.confirmationCount;
      });
      return { confirmationCount: count, confirmedByMe: false, communityConfirmed: count >= t };
    },

    /** Moderator status change: transition rules, history, notification and audit row in one transaction. */
    async changeStatus(actor: { userId: string }, id: string, input: ReportStatusChange): Promise<ReportDetailDto> {
      const note = input.note?.trim() || undefined;
      let flush: (() => Promise<void>) | undefined;
      await prisma.$transaction(async (tx) => {
        const r = await tx.report.findFirst({ where: { id, deletedAt: null } });
        if (!r) throw errors.notFound("We couldn't find that report.");
        const allowed = REPORT_TRANSITIONS[r.status];
        if (!allowed.includes(input.status)) {
          throw errors.conflict(
            `A ${r.status.toLowerCase().replace("_", " ")} report can't move to ${input.status.toLowerCase().replace("_", " ")}.`,
          );
        }
        if (input.status === "REJECTED" && !note) {
          throw errors.validation([{ field: "body.note", message: "Add a reason when rejecting a report." }]);
        }
        const moved = await tx.report.updateMany({
          where: { id, status: r.status },
          data: {
            status: input.status,
            moderatorNote: note ?? null,
            resolvedAt: input.status === "RESOLVED" ? deps.clock.now() : null,
            version: { increment: 1 },
          },
        });
        if (moved.count === 0) throw errors.conflict("Someone else just changed this report. Refresh and try again.");
        await tx.reportStatusHistory.create({
          data: {
            reportId: id,
            fromStatus: r.status,
            toStatus: input.status,
            changedBy: actor.userId,
            note: note ?? null,
          },
        });
        await tx.moderationAction.create({
          data: {
            actorId: actor.userId,
            action: AUDIT_ACTION[input.status as keyof typeof AUDIT_ACTION] ?? "STATUS_CHANGE",
            targetType: "REPORT",
            targetId: id,
            reason: note ?? `Status changed from ${r.status} to ${input.status}`,
            meta: { from: r.status, to: input.status },
          },
        });
        const n = await deps.notifications.create(tx, {
          userId: r.authorId,
          type: "REPORT_STATUS",
          module: "saferoute",
          title: STATUS_TITLE[input.status],
          body: note ? `"${r.title}": ${note}` : `"${r.title}" is now ${input.status.toLowerCase().replace("_", " ")}.`,
          link: `/saferoute/${id}`,
          data: { reportId: id, status: input.status },
        });
        flush = n.flush;
      });
      await flush?.();
      return detail(id, { userId: actor.userId, role: "MODERATOR" });
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
