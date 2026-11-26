// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [
      { name: "ss_session", value: "tok en" },
      { name: "other", value: "1" },
    ],
  }),
}));

const { apiUrl, serverFetch } = await import("./server-fetch");

describe("serverFetch", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("forwards the visitor's cookies to the API origin", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await serverFetch("/api/health/live");
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("http://localhost:4000/api/health/live");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("cookie")).toBe("ss_session=tok%20en; other=1");
    expect(headers.get("x-requested-with")).toBe("XMLHttpRequest");
  });

  it("only allows /api/ paths", () => {
    expect(() => apiUrl("http://evil.example/x")).toThrow();
  });
});
