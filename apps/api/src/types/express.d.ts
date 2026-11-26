import type { UserRole } from "@saferstreets/shared";

declare global {
  namespace Express {
    interface AuthContext {
      userId: string;
      role: UserRole;
      sessionId: string;
    }

    interface Request {
      /** Request id (incoming X-Request-Id if well-formed, else a new UUID). */
      id: string;
      /** Set by attachSession when a valid session cookie is present. */
      auth?: AuthContext;
      /** Why a presented session was not accepted (for requireAuth's error). */
      authRejection?: "suspended" | "banned";
      /** Parsed and validated inputs from the validate middleware. */
      valid?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
