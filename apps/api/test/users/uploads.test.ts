import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  INCOMING_TRANSFORMATION,
  assetAllowed,
  createCloudinaryClient,
  signParams,
  type CloudinaryClient,
  type StoredAsset,
} from "../../src/modules/uploads/cloudinary.js";
import { UPLOAD_QUOTA_PER_DAY } from "../../src/modules/uploads/uploads.service.js";
import { buildTestApp, prisma, xhr } from "../helpers.js";
import { loginOnboarded } from "../authHelpers.js";

function fakeCloudinary(
  asset: StoredAsset | null = { format: "webp", bytes: 120_000, secureUrl: "https://res.example/avatars/x.webp" },
) {
  const client: CloudinaryClient = {
    sign: (publicId, now) => ({
      uploadUrl: "https://upload.example/image/upload",
      fields: {
        public_id: publicId,
        timestamp: String(Math.floor(now.getTime() / 1000)),
        signature: "sig",
        api_key: "key",
      },
    }),
    inspect: async () => asset,
  };
  return client;
}

const sign = (app: Parameters<typeof request>[0], cookie: string, body: object) =>
  request(app).post("/api/v1/uploads/sign").set(xhr).set("Cookie", cookie).send(body);
const okBody = { purpose: "AVATAR", contentType: "image/png", sizeBytes: 200_000 };

describe("POST /uploads/sign", () => {
  it("needs a session", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    expect((await request(app).post("/api/v1/uploads/sign").set(xhr).send(okBody)).status).toBe(401);
  });

  it("answers 503 plainly when photo storage is not configured", async () => {
    const { app } = buildTestApp({ cloudinary: null });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const res = await sign(app, cookie, okBody);
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe("Photo uploads aren't set up yet.");
    expect(await prisma.upload.count()).toBe(0);
  });

  it("creates a PENDING upload with a random key and returns signed fields", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const res = await sign(app, cookie, okBody);
    expect(res.status).toBe(200);
    const row = await prisma.upload.findFirstOrThrow();
    expect(row).toMatchObject({ purpose: "AVATAR", status: "PENDING" });
    expect(row.storageKey).toMatch(/^avatars\/[0-9a-f-]{36}$/);
    expect(res.body.data.uploadId).toBe(row.id);
    expect(res.body.data.fields.public_id).toBe(row.storageKey);
  });

  it("rejects wrong MIME types, oversized files and non-avatar purposes", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    const cookie = await loginOnboarded(app, "riya@example.test");
    for (const contentType of ["image/gif", "image/svg+xml", "application/pdf", "text/html"]) {
      expect((await sign(app, cookie, { ...okBody, contentType })).status, contentType).toBe(400);
    }
    expect((await sign(app, cookie, { ...okBody, sizeBytes: 5 * 1024 * 1024 + 1 })).status).toBe(400);
    expect((await sign(app, cookie, { ...okBody, sizeBytes: 0 })).status).toBe(400);
    expect((await sign(app, cookie, { ...okBody, purpose: "ALERT" })).status).toBe(400);
    expect(await prisma.upload.count()).toBe(0);
  });

  it("applies a per-user daily quota", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    const cookie = await loginOnboarded(app, "riya@example.test");
    for (let i = 0; i < UPLOAD_QUOTA_PER_DAY; i++) expect((await sign(app, cookie, okBody)).status).toBe(200);
    const over = await sign(app, cookie, okBody);
    expect(over.status).toBe(429);
    const other = await loginOnboarded(app, "arjun@example.test", "Arjun K");
    expect((await sign(app, other, okBody)).status).toBe(200);
  });
});

describe("attaching an avatar (PATCH /me avatarUploadId)", () => {
  async function pending(app: Parameters<typeof request>[0], cookie: string) {
    const res = await sign(app, cookie, okBody);
    return res.body.data.uploadId as string;
  }
  const attach = (app: Parameters<typeof request>[0], cookie: string, id: string | null) =>
    request(app).patch("/api/v1/me").set(xhr).set("Cookie", cookie).send({ avatarUploadId: id });

  it("re-checks the stored asset, saves the URL and marks the upload ATTACHED", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const id = await pending(app, cookie);
    const res = await attach(app, cookie, id);
    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe("https://res.example/avatars/x.webp");
    expect((await prisma.upload.findUniqueOrThrow({ where: { id } })).status).toBe("ATTACHED");
    // An attached upload cannot be attached twice.
    expect((await attach(app, cookie, id)).status).toBe(404);
  });

  it("rejects disallowed formats and oversized assets even if the client lied, and orphans the upload", async () => {
    for (const asset of [
      { format: "gif", bytes: 1000, secureUrl: "https://res.example/a.gif" },
      { format: "webp", bytes: 6 * 1024 * 1024, secureUrl: "https://res.example/b.webp" },
    ]) {
      const { app } = buildTestApp({ cloudinary: fakeCloudinary(asset) });
      const cookie = await loginOnboarded(app, `u${asset.format}${asset.bytes}@example.test`);
      const id = await pending(app, cookie);
      const res = await attach(app, cookie, id);
      expect(res.status).toBe(400);
      expect((await prisma.upload.findUniqueOrThrow({ where: { id } })).status).toBe("ORPHANED");
      expect((await request(app).get("/api/v1/me").set("Cookie", cookie)).body.data.avatarUrl).toBeNull();
    }
  });

  it("rejects an upload that never reached storage", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary(null) });
    const cookie = await loginOnboarded(app, "riya@example.test");
    const id = await pending(app, cookie);
    const res = await attach(app, cookie, id);
    expect(res.status).toBe(400);
    expect((await prisma.upload.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("IDOR: cannot attach someone else's upload, or an unknown one", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    const owner = await loginOnboarded(app, "riya@example.test");
    const id = await pending(app, owner);
    const intruder = await loginOnboarded(app, "arjun@example.test", "Arjun K");
    expect((await attach(app, intruder, id)).status).toBe(404);
    expect((await attach(app, intruder, "7b0c3a52-8d36-4f7e-9b0a-2f1a3c4d5e6f")).status).toBe(404);
    expect((await prisma.upload.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("removes the photo with avatarUploadId null", async () => {
    const { app } = buildTestApp({ cloudinary: fakeCloudinary() });
    const cookie = await loginOnboarded(app, "riya@example.test");
    await attach(app, cookie, await pending(app, cookie));
    const res = await attach(app, cookie, null);
    expect(res.body.data.avatarUrl).toBeNull();
  });
});

describe("Cloudinary signing", () => {
  it("signs sorted params with SHA-1 over params + secret", () => {
    const params = { timestamp: "1700000000", public_id: "avatars/abc", allowed_formats: "jpg,png,webp" };
    const expected = createHash("sha1")
      .update("allowed_formats=jpg,png,webp&public_id=avatars/abc&timestamp=1700000000" + "secret")
      .digest("hex");
    expect(signParams(params, "secret")).toBe(expected);
  });

  it("is off without credentials, and signs the strip-metadata transformation with them", () => {
    expect(
      createCloudinaryClient({
        CLOUDINARY_CLOUD_NAME: undefined,
        CLOUDINARY_API_KEY: undefined,
        CLOUDINARY_API_SECRET: undefined,
      }),
    ).toBeNull();
    const client = createCloudinaryClient({
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "k",
      CLOUDINARY_API_SECRET: "s",
    })!;
    const s = client.sign("avatars/x", new Date("2026-11-25T10:00:00Z"));
    expect(s.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(s.fields.transformation).toBe(INCOMING_TRANSFORMATION);
    expect(INCOMING_TRANSFORMATION).toContain("fl_strip_profile");
    expect(s.fields.allowed_formats).toBe("jpg,png,webp");
    expect(s.fields.api_key).toBe("k");
    expect(s.fields).not.toHaveProperty("api_secret");
    expect(JSON.stringify(s)).not.toContain('"s"');
  });

  it("allows only jpg/png/webp up to 5 MB", () => {
    expect(assetAllowed({ format: "png", bytes: 5 * 1024 * 1024, secureUrl: "" })).toBe(true);
    expect(assetAllowed({ format: "png", bytes: 5 * 1024 * 1024 + 1, secureUrl: "" })).toBe(false);
    expect(assetAllowed({ format: "svg", bytes: 10, secureUrl: "" })).toBe(false);
  });
});
