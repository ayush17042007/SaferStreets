// Cloudinary signed direct uploads (appendix-07 7.6, Part B9). The API signs, the browser uploads,
// and the API re-checks the stored asset (format and size) before it is attached to anything.
import { createHash } from "node:crypto";
import { ALLOWED_IMAGE_FORMATS, MAX_UPLOAD_BYTES } from "@saferstreets/shared";
import type { Env } from "../../config/env.js";

export interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
}

export interface StoredAsset {
  format: string;
  bytes: number;
  secureUrl: string;
}

export interface CloudinaryClient {
  sign(publicId: string, now: Date): SignedUpload;
  /** Looks the asset up server-side. Null when it does not exist (upload never happened). */
  inspect(publicId: string): Promise<StoredAsset | null>;
}

/** Incoming transformation: strip metadata (EXIF location), re-encode to WebP, cap the size. */
export const INCOMING_TRANSFORMATION = "f_webp,fl_strip_profile,c_limit,w_1024,h_1024";

export function signParams(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

export function createCloudinaryClient(
  env: Pick<Env, "CLOUDINARY_CLOUD_NAME" | "CLOUDINARY_API_KEY" | "CLOUDINARY_API_SECRET">,
  fetchImpl: typeof fetch = fetch,
): CloudinaryClient | null {
  const cloud = env.CLOUDINARY_CLOUD_NAME;
  const key = env.CLOUDINARY_API_KEY;
  const secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return null;

  return {
    sign(publicId, now) {
      const signed = {
        allowed_formats: ALLOWED_IMAGE_FORMATS.join(","),
        public_id: publicId,
        timestamp: String(Math.floor(now.getTime() / 1000)),
        transformation: INCOMING_TRANSFORMATION,
      };
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        fields: { ...signed, api_key: key, signature: signParams(signed, secret) },
      };
    },
    async inspect(publicId) {
      const res = await fetchImpl(
        `https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/${encodeURI(publicId)}`,
        { headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` } },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary responded ${res.status}`);
      const body = (await res.json()) as { format?: string; bytes?: number; secure_url?: string };
      if (!body.format || typeof body.bytes !== "number" || !body.secure_url) return null;
      return { format: body.format, bytes: body.bytes, secureUrl: body.secure_url };
    },
  };
}

export function assetAllowed(asset: StoredAsset): boolean {
  return (ALLOWED_IMAGE_FORMATS as readonly string[]).includes(asset.format) && asset.bytes <= MAX_UPLOAD_BYTES;
}
