import { emergencyNumbersResponseSchema, regionResponseSchema } from "@saferstreets/shared";
import type { RouteDef } from "../../http/routes.js";
import type { SettingsService } from "../settings/settings.service.js";
import { createPublicController } from "./public.controller.js";

export function publicRoutes(settings: SettingsService): RouteDef[] {
  const c = createPublicController(settings);
  return [
    {
      method: "get",
      path: "/public/emergency-numbers",
      summary: "Emergency numbers shown in the emergency sheet (from system settings)",
      tags: ["public"],
      auth: "public",
      responses: { 200: { description: "Configured emergency numbers", schema: emergencyNumbersResponseSchema } },
      handlers: [c.emergencyNumbers],
    },
    {
      method: "get",
      path: "/public/region",
      summary: "Service area bounding box (system settings)",
      tags: ["public"],
      auth: "public",
      responses: { 200: { description: "Region", schema: regionResponseSchema } },
      handlers: [c.region],
    },
  ];
}
