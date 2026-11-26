// Upload signing (appendix-07 7.4, Part B7). Avatars first; reports and alerts reuse it later.
import { z } from "zod";
import { UploadPurpose } from "../../enums.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_IMAGE_FORMATS = ["jpg", "png", "webp"] as const;

export const signUploadSchema = z.object({
  purpose: UploadPurpose.schema,
  contentType: z.enum(ALLOWED_IMAGE_TYPES, "Use a JPEG, PNG or WebP image."),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, "That photo is larger than 5 MB."),
});

export const signUploadResponseSchema = z.object({
  data: z.object({
    uploadId: z.uuid(),
    uploadUrl: z.string(),
    /** Fields to POST as multipart form data to uploadUrl, together with the file. */
    fields: z.record(z.string(), z.string()),
  }),
});
