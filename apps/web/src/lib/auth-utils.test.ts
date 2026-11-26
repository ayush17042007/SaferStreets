// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { maskEmail } from "@/components/auth/storage";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [] }) }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

const { safeNext } = await import("./session");

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("riya@example.com")).toBe("r***@example.com");
    expect(maskEmail("a@x.in")).toBe("a***@x.in");
  });
});

describe("safeNext (no open redirects)", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/profile")).toBe("/profile");
    expect(safeNext("/settings?tab=contacts")).toBe("/settings?tab=contacts");
  });
  it("rejects absolute, protocol-relative and auth-loop targets", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil",
      "",
      undefined,
      "/login",
      "/verify?x=1",
    ]) {
      expect(safeNext(bad as string | undefined)).toBe("/dashboard");
    }
    expect(safeNext("//evil.example", "/")).toBe("/");
  });
});
