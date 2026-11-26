import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS } from "../../src/lib/logger.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const log = pino({ level: "info", redact: { paths: REDACT_PATHS, censor: "[redacted]" } }, stream);
  return { log, lines };
}

describe("logger redaction (Part B6)", () => {
  it("redacts emails, phones, tokens, OTPs and cookies at any common depth", () => {
    const { log, lines } = capture();
    log.info(
      {
        email: "riya@example.test",
        user: { phone: "9876543210", profile: { email: "a@b.test" } },
        otp: "123456",
        body: { code: "654321", token: "tok" },
        req: { headers: { cookie: "ss_session=secret", authorization: "Bearer x" } },
      },
      "event",
    );
    const out = lines.join("");
    for (const secret of [
      "riya@example.test",
      "9876543210",
      "a@b.test",
      "123456",
      "654321",
      "ss_session=secret",
      "Bearer x",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[redacted]");
  });
});
