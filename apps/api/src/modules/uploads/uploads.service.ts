import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES, type UploadPurpose } from "@saferstreets/shared";
import type { Clock } from "../../lib/clock.js";
import { errors } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { assetAllowed, type CloudinaryClient } from "./cloudinary.js";

export const UPLOAD_QUOTA_PER_DAY = 10;

export function createUploadsService(deps: {
  prisma: PrismaClient;
  clock: Clock;
  cloudinary: CloudinaryClient | null;
}) {
  const { prisma, clock } = deps;

  function requireStorage(): CloudinaryClient {
    if (!deps.cloudinary) throw errors.serviceUnavailable("Photo uploads aren't set up yet.");
    return deps.cloudinary;
  }

  return {
    /** Creates a PENDING upload row and returns signed params. Avatars and report photos for now. */
    async sign(userId: string, input: { purpose: UploadPurpose; contentType: string; sizeBytes: number }) {
      if (input.purpose !== "AVATAR" && input.purpose !== "REPORT") {
        throw errors.validation([{ field: "purpose", message: "Photos for this are not available yet." }]);
      }
      if (input.sizeBytes > MAX_UPLOAD_BYTES) {
        throw errors.validation([{ field: "sizeBytes", message: "That photo is larger than 5 MB." }]);
      }
      const storage = requireStorage();
      const since = new Date(clock.now().getTime() - 24 * 3600 * 1000);
      const recent = await prisma.upload.count({ where: { userId, createdAt: { gte: since } } });
      if (recent >= UPLOAD_QUOTA_PER_DAY) throw errors.rateLimited(3600);

      // Random key: never derived from user input or file names.
      const storageKey = `${input.purpose === "AVATAR" ? "avatars" : "reports"}/${randomUUID()}`;
      const upload = await prisma.upload.create({ data: { userId, purpose: input.purpose, storageKey } });
      const signed = storage.sign(storageKey, clock.now());
      return { uploadId: upload.id, uploadUrl: signed.uploadUrl, fields: signed.fields };
    },

    /**
     * Re-checks the stored asset (the client is never trusted), then marks the upload ATTACHED.
     * Returns the final URL to save on the owner record.
     */
    async attach(userId: string, uploadId: string, purpose: UploadPurpose): Promise<string> {
      const upload = await prisma.upload.findFirst({ where: { id: uploadId, userId, purpose } });
      if (!upload || upload.status !== "PENDING") throw errors.notFound("We couldn't find that upload.");
      const storage = requireStorage();
      const asset = await storage.inspect(upload.storageKey);
      if (!asset)
        throw errors.validation([{ field: "avatarUploadId", message: "The photo didn't upload. Try again." }]);
      if (!assetAllowed(asset)) {
        await prisma.upload.update({ where: { id: upload.id }, data: { status: "ORPHANED" } });
        throw errors.validation([{ field: "avatarUploadId", message: "Use a JPEG, PNG or WebP photo up to 5 MB." }]);
      }
      await prisma.upload.update({ where: { id: upload.id }, data: { status: "ATTACHED" } });
      return asset.secureUrl;
    },
  };
}

export type UploadsService = ReturnType<typeof createUploadsService>;
