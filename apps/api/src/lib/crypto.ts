// Small crypto helpers: CSPRNG codes and tokens, and AES-256-GCM sealing for job payloads.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";

/** 6-digit numeric code from a CSPRNG (zero padded). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 256-bit URL-safe random token. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function key(secret: string): Buffer {
  return createHash("sha256").update(`seal:${secret}`).digest();
}

/** Encrypts JSON so recipients and codes never sit in clear text in the job queue tables. */
export function seal(secret: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function open<T>(secret: string, sealed: string): T {
  const raw = Buffer.from(sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const dec = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}
