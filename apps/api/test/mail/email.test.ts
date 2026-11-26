import { PgBoss } from "pg-boss";
import { afterAll, describe, expect, it, vi } from "vitest";
import { sendEmailJob, createEmailSendJob } from "../../src/jobs/handlers/emailSend.js";
import { createPgBossPublisher } from "../../src/jobs/publisher.js";
import { JOB_NAMES, registerJobs } from "../../src/jobs/registry.js";
import { systemClock } from "../../src/lib/clock.js";
import { open } from "../../src/lib/crypto.js";
import { createEmailService, emailHash, type EmailJobData } from "../../src/modules/mail/email.service.js";
import { createCaptureMailer, createResendMailer, type Mailer } from "../../src/modules/mail/mailer.js";
import { renderOtpEmail } from "../../src/modules/mail/templates.js";
import { createInlinePublisher } from "../../src/jobs/publisher.js";
import { env, pool, prisma, silentLogger } from "../helpers.js";

const TEST_SCHEMA = "pgboss_mail_test";
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
});

const ctx = (isLastAttempt = false) => ({ prisma, log: silentLogger, clock: systemClock, isLastAttempt });
const deps = (mailer: Mailer) => ({ mailer, secret: env.OTP_HMAC_SECRET });

async function enqueueOtp(to = "riya@example.test", code = "482917") {
  const publisher = createInlinePublisher();
  const email = createEmailService({ prisma, publisher, env });
  const eventId = await email.sendOtp(to, code);
  return { eventId, job: publisher.jobs[0]!.data as EmailJobData };
}

describe("OTP email template (B8)", () => {
  it("has branded HTML and a plain-text version with the code, expiry and the 112 disclaimer", () => {
    const m = renderOtpEmail("482917");
    expect(m.subject).toContain("482917");
    expect(m.text).toContain("log in code: 482917");
    expect(m.text).toContain("10 minutes");
    expect(m.html).toContain("482917");
    expect(m.html).toContain("SaferStreets");
    for (const body of [m.html, m.text]) expect(body).toContain("call 112");
    expect(m.text).not.toMatch(/[!]/);
  });
});

describe("enqueue", () => {
  it("creates a QUEUED email_event with a hashed recipient and a sealed payload (no plaintext address or code)", async () => {
    const { eventId, job } = await enqueueOtp();
    const event = await prisma.emailEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event).toMatchObject({ template: "otp", status: "QUEUED", toHash: emailHash("riya@example.test") });
    const raw = JSON.stringify(job);
    expect(raw).not.toContain("riya@example.test");
    expect(raw).not.toContain("482917");
    // The worker can open it with the server secret, and only with it.
    expect(open<{ to: string }>(env.OTP_HMAC_SECRET, job.sealed).to).toBe("riya@example.test");
    expect(() => open(env.OTP_HMAC_SECRET + "x", job.sealed)).toThrow();
  });
});

describe("email.send job", () => {
  it("sends once, records SENT with the provider id, and is idempotent on retry", async () => {
    const { eventId, job } = await enqueueOtp();
    const send = vi.fn(async () => ({ providerId: "prov_1" }));
    await sendEmailJob(job, ctx(), deps({ name: "capture", send }));
    await sendEmailJob(job, ctx(), deps({ name: "capture", send }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.emailEvent.findUniqueOrThrow({ where: { id: eventId } })).toMatchObject({
      status: "SENT",
      providerId: "prov_1",
    });
  });

  it("throws on failure so pg-boss retries, keeps QUEUED, then FAILED on the last attempt", async () => {
    const { eventId, job } = await enqueueOtp();
    const failing: Mailer = { name: "capture", send: async () => Promise.reject(new Error("provider down")) };
    await expect(sendEmailJob(job, ctx(false), deps(failing))).rejects.toThrow("provider down");
    expect(await prisma.emailEvent.findUniqueOrThrow({ where: { id: eventId } })).toMatchObject({
      status: "QUEUED",
      error: "provider down",
    });
    await expect(sendEmailJob(job, ctx(true), deps(failing))).rejects.toThrow("provider down");
    const event = await prisma.emailEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.status).toBe("FAILED");
    expect(event.error).not.toContain("riya@example.test");
  });

  it("skips suppressed addresses and records why", async () => {
    await prisma.emailSuppression.create({ data: { emailHash: emailHash("riya@example.test"), reason: "BOUNCED" } });
    const { eventId, job } = await enqueueOtp();
    const send = vi.fn(async () => ({}));
    await sendEmailJob(job, ctx(), deps({ name: "capture", send }));
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.emailEvent.findUniqueOrThrow({ where: { id: eventId } })).toMatchObject({
      status: "FAILED",
      error: "suppressed: BOUNCED",
    });
  });

  it("drops a job whose event row is gone instead of failing forever", async () => {
    const { eventId, job } = await enqueueOtp();
    await prisma.emailEvent.delete({ where: { id: eventId } });
    const send = vi.fn(async () => ({}));
    await expect(sendEmailJob(job, ctx(), deps({ name: "capture", send }))).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("has 5 retries with backoff and a short retention", () => {
    const def = createEmailSendJob(deps(createCaptureMailer(prisma)));
    expect(def).toMatchObject({ name: "email.send", retryLimit: 5, deleteAfterSeconds: 3600 });
    expect(def.retryDelaySeconds).toBeGreaterThan(0);
  });

  it("runs end to end through pg-boss: API publisher -> worker -> capture mailer", async () => {
    const publisher = await createPgBossPublisher({
      connectionString: env.DATABASE_URL,
      log: silentLogger,
      schema: TEST_SCHEMA,
    });
    const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: TEST_SCHEMA });
    boss.on("error", () => {});
    await boss.start();
    try {
      await registerJobs(boss, [createEmailSendJob(deps(createCaptureMailer(prisma))) as never], {
        prisma,
        clock: systemClock,
        log: silentLogger,
      });
      const queue = await boss.getQueue(JOB_NAMES.emailSend);
      expect(queue).toMatchObject({
        retryLimit: 5,
        retryBackoff: true,
        deleteAfterSeconds: 3600,
        deadLetter: "email.send.dlq",
      });

      const email = createEmailService({ prisma, publisher, env });
      const eventId = await email.sendOtp("pgboss@example.test", "135790");
      const deadline = Date.now() + 25_000;
      let captured = null;
      while (!captured && Date.now() < deadline) {
        captured = await prisma.capturedEmail.findFirst({ where: { toEmail: "pgboss@example.test" } });
        if (!captured) await new Promise((r) => setTimeout(r, 300));
      }
      expect(captured?.textBody).toContain("135790");
      expect((await prisma.emailEvent.findUniqueOrThrow({ where: { id: eventId } })).status).toBe("SENT");
    } finally {
      await publisher.close();
      await boss.stop({ graceful: false, close: true });
    }
  });
});

describe("mailers", () => {
  it("resend: posts to the Resend API with a bearer key and returns the message id", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "SaferStreets <no-reply@example.test>",
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const out = await mailer.send({ to: "a@example.test", subject: "s", html: "<p>h</p>", text: "t" });
    expect(out.providerId).toBe("msg_1");
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ to: ["a@example.test"], subject: "s" });
  });

  it("resend: throws on a non-2xx answer so the job retries", async () => {
    const mailer = createResendMailer({
      apiKey: "k",
      from: "x",
      fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    });
    await expect(mailer.send({ to: "a@example.test", subject: "s", html: "h", text: "t" })).rejects.toThrow("500");
  });

  it("capture: stores the message in captured_emails", async () => {
    const out = await createCaptureMailer(prisma).send({
      to: "a@example.test",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(out.providerId).toBeDefined();
    expect(await prisma.capturedEmail.count({ where: { toEmail: "a@example.test" } })).toBe(1);
  });
});
