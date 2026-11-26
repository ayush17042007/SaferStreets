import { signUploadResponseSchema, signUploadSchema, type UploadPurpose } from "@saferstreets/shared";
import type { RequestHandler } from "express";
import type { RouteDef } from "../../http/routes.js";
import type { UploadsService } from "./uploads.service.js";

export function uploadsRoutes(service: UploadsService): RouteDef[] {
  const sign: RequestHandler = async (req, res, next) => {
    try {
      const body = req.body as { purpose: UploadPurpose; contentType: string; sizeBytes: number };
      res.json({ data: await service.sign(req.auth!.userId, body) });
    } catch (err) {
      next(err);
    }
  };
  return [
    {
      method: "post",
      path: "/uploads/sign",
      summary: "Signed direct-upload parameters (Cloudinary). Avatar only for now.",
      tags: ["uploads"],
      auth: "user",
      request: { body: signUploadSchema },
      responses: {
        200: { description: "Signed upload", schema: signUploadResponseSchema },
        503: { description: "Photo storage not configured" },
      },
      handlers: [sign],
    },
  ];
}
