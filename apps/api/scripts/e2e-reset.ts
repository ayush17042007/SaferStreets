// Resets the throwaway state the Playwright flows depend on in the TEST database:
// rate-limit counters, login codes and captured emails. Users are left alone (each run uses fresh emails).
// Refuses to run against anything that is not the configured test database.
import pg from "pg";

const url = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!url || !testUrl || url !== testUrl) {
  console.error("e2e-reset: DATABASE_URL must equal TEST_DATABASE_URL.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("TRUNCATE rate_limits, otp_codes, captured_emails");
  console.log("e2e-reset: cleared rate limits, login codes and captured emails.");
} finally {
  await client.end();
}
