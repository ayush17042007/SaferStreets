// Verifies the migrated database itself via pg_catalog: tables, CHECKs, the partial unique
// index, FK index coverage, and that the constraints are actually enforced.
import { describe, expect, it } from "vitest";
import { createUser, pool, prisma } from "../helpers.js";

const EXPECTED_TABLES = [
  // appendix-06 6.2
  "users",
  "otp_codes",
  "sessions",
  "emergency_contacts",
  "reports",
  "report_photos",
  "report_confirmations",
  "report_status_history",
  "rides",
  "ride_requests",
  "ride_participants",
  "ride_messages",
  "journeys",
  "journey_events",
  "journey_locations",
  "alerts",
  "alert_votes",
  "alert_subscriptions",
  "notifications",
  "flags",
  "moderation_actions",
  "system_settings",
  // Part B4
  "idempotency_keys",
  "user_blocks",
  "uploads",
  "email_events",
  "email_suppressions",
  "heartbeats",
  "consents",
  "ride_waitlist",
  // rate-limiter-flexible Postgres store (Part 0.4)
  "rate_limits",
  // capture mail transport (dev and tests only)
  "captured_emails",
];

const EXPECTED_CHECKS = [
  "users_strike_count_check",
  "users_phone_format_check",
  "users_full_name_length_check",
  "otp_codes_attempts_check",
  "emergency_contacts_phone_format_check",
  "reports_latitude_check",
  "reports_longitude_check",
  "reports_confirmation_count_check",
  "reports_title_length_check",
  "reports_description_length_check",
  "reports_version_check",
  "report_photos_position_check",
  "report_photos_dimensions_check",
  "rides_source_lat_check",
  "rides_source_lng_check",
  "rides_dest_lat_check",
  "rides_dest_lng_check",
  "rides_seats_total_check",
  "rides_seats_taken_check",
  "rides_estimated_total_fare_check",
  "rides_version_check",
  "ride_messages_body_length_check",
  "journeys_dest_lat_check",
  "journeys_dest_lng_check",
  "journeys_extensions_used_check",
  "journeys_escalation_minutes_check",
  "alerts_latitude_check",
  "alerts_longitude_check",
  "alerts_confirm_count_check",
  "alerts_dispute_count_check",
  "alerts_description_length_check",
  "alert_subscriptions_center_lat_check",
  "alert_subscriptions_center_lng_check",
  "alert_subscriptions_radius_km_check",
  "alert_subscriptions_enabled_center_check",
  "user_blocks_not_self_check",
  "idempotency_keys_response_status_check",
  "moderation_actions_reason_check",
];

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe("database catalog", () => {
  it("has every table from appendix-06 6.2 and Part B4", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    expect(rows.map((r) => r.tablename).sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it("uses citext for emails, uuid defaults and timestamptz", async () => {
    const { rows } = await pool.query(`
      SELECT table_name, column_name, data_type, udt_name, column_default
      FROM information_schema.columns WHERE table_schema = 'public'`);
    const col = (t: string, c: string) => rows.find((r) => r.table_name === t && r.column_name === c);
    expect(col("users", "email")?.udt_name).toBe("citext");
    expect(col("emergency_contacts", "email")?.udt_name).toBe("citext");
    expect(col("users", "id")?.column_default).toContain("gen_random_uuid()");
    const timestamps = rows.filter((r) => /_at$/.test(r.column_name));
    expect(timestamps.length).toBeGreaterThan(50);
    for (const t of timestamps)
      expect(`${t.table_name}.${t.column_name}:${t.data_type}`).toMatch(/timestamp with time zone$/);
    for (const table of EXPECTED_TABLES.filter((t) => t !== "rate_limits" && t !== "journey_locations")) {
      expect(col(table, "created_at"), `${table}.created_at`).toBeDefined();
      expect(col(table, "updated_at"), `${table}.updated_at`).toBeDefined();
    }
    expect(col("rides", "version")).toBeDefined();
    expect(col("reports", "version")).toBeDefined();
  });

  it("has every CHECK constraint", async () => {
    const { rows } = await pool.query<{ conname: string }>(
      "SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace",
    );
    const names = new Set(rows.map((r) => r.conname));
    for (const c of EXPECTED_CHECKS) expect(names.has(c), c).toBe(true);
  });

  it("has the partial UNIQUE index for one active journey per user", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'journeys_one_active_per_user'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toMatch(/CREATE UNIQUE INDEX .* ON public\.journeys .*\(user_id\) WHERE/);
    expect(rows[0]!.indexdef).toMatch(/ACTIVE.*OVERDUE/);
  });

  it("has an index covering every foreign key", async () => {
    const { rows: fks } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace",
    );
    expect(fks[0].n).toBeGreaterThan(30);
    const { rows } = await pool.query(`
      SELECT c.conrelid::regclass::text AS tbl, c.conname
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] = c.conkey
        )`);
    expect(rows).toEqual([]);
  });
});

describe("constraints are enforced", () => {
  it("rejects out-of-range seats, fares and coordinates", async () => {
    const u = await createUser();
    const ride = (over: Record<string, unknown>) =>
      prisma.ride.create({
        data: {
          creatorId: u.id,
          sourceText: "Hostel Gate",
          sourceLat: 25.14,
          sourceLng: 75.83,
          destText: "Railway Station",
          destLat: 25.16,
          destLng: 75.85,
          departureAt: new Date(Date.now() + 3600_000),
          seatsTotal: 3,
          estimatedTotalFare: 120,
          ...over,
        },
      });
    expect(await pgCode(ride({ seatsTotal: 4 }))).toBeDefined();
    expect(await pgCode(ride({ estimatedTotalFare: 9 }))).toBeDefined();
    expect(await pgCode(ride({ estimatedTotalFare: 5001 }))).toBeDefined();
    expect(await pgCode(ride({ sourceLat: 91 }))).toBeDefined();
    const ok = await ride({});
    expect(await pgCode(prisma.ride.update({ where: { id: ok.id }, data: { seatsTaken: 4 } }))).toBeDefined();
  });

  it("rejects negative strike counts and out-of-range alert radius", async () => {
    const u = await createUser();
    expect(await pgCode(pool.query("UPDATE users SET strike_count = -1 WHERE id = $1", [u.id]))).toBe("23514");
    expect(
      await pgCode(pool.query("INSERT INTO alert_subscriptions (user_id, radius_km) VALUES ($1, 11)", [u.id])),
    ).toBe("23514");
    expect(
      await pgCode(
        pool.query("INSERT INTO alert_subscriptions (user_id, radius_km, enabled) VALUES ($1, 3, true)", [u.id]),
      ),
    ).toBe("23514");
  });

  it("allows only one ACTIVE/OVERDUE journey per user", async () => {
    const u = await createUser();
    const journey = (n: number, status: "ACTIVE" | "OVERDUE" | "COMPLETED") =>
      prisma.journey.create({
        data: {
          userId: u.id,
          destinationText: "Railway Station",
          expectedArrivalAt: new Date(Date.now() + 3600_000),
          trackTokenHash: `hash-${n}`,
          trackTokenExpiresAt: new Date(Date.now() + 86_400_000),
          status,
        },
      });
    await journey(1, "COMPLETED");
    await journey(2, "ACTIVE");
    await journey(3, "COMPLETED");
    expect(await pgCode(journey(4, "OVERDUE"))).toBeDefined();
  });

  it("keeps the audit log append-only", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const a = await prisma.moderationAction.create({
      data: { actorId: admin.id, action: "WARN", targetType: "USER", targetId: admin.id, reason: "test" },
    });
    expect(await pgCode(pool.query("UPDATE moderation_actions SET reason = 'changed' WHERE id = $1", [a.id]))).toBe(
      "23514",
    );
    expect(await pgCode(pool.query("DELETE FROM moderation_actions WHERE id = $1", [a.id]))).toBe("23514");
    // Rows past the 2-year retention may be deleted by the cleanup job.
    await pool.query("ALTER TABLE moderation_actions DISABLE TRIGGER moderation_actions_append_only");
    await pool.query("UPDATE moderation_actions SET created_at = now() - interval '25 months' WHERE id = $1", [a.id]);
    await pool.query("ALTER TABLE moderation_actions ENABLE TRIGGER moderation_actions_append_only");
    expect(await pgCode(pool.query("DELETE FROM moderation_actions WHERE id = $1", [a.id]))).toBeUndefined();
  });

  it("treats emails case-insensitively", async () => {
    await createUser({ email: "Riya@Example.test" });
    expect(await pgCode(createUser({ email: "riya@example.TEST" }))).toBe("P2002");
  });
});
