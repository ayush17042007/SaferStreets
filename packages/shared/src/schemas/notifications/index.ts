// Notification schemas (appendix-07 7.4). Endpoints arrive in Prompt 10.
import { z } from "zod";
import { cursorQuerySchema } from "../../pagination.js";

export const listNotificationsQuerySchema = cursorQuerySchema.extend({
  unread: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
