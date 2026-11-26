// OpenAPI 3.1 document generated from the Zod schemas registered by mountRoutes (Part B5).
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

export function createRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "session", {
    type: "apiKey",
    in: "cookie",
    name: "ss_session",
    description: "httpOnly session cookie issued after email OTP login",
  });
  return registry;
}

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31["generateDocument"]>;

export function buildOpenApiDocument(registry: OpenAPIRegistry): OpenApiDocument {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "SaferStreets API",
      version: "1",
      description:
        "Same-origin API behind the Next.js /api/* rewrite. Business endpoints live under /api/v1. Errors use { error: { code, message, details?, requestId } }.",
    },
  });
}
