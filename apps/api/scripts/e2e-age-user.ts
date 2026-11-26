// Makes an e2e user old enough to post and be shown alerts (account-age gates) by back-dating created_at.
// Refuses to run against anything that is not the configured test database.
import pg from "pg";

const url = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
const email = process.argv[2];
if (!url || !testUrl || url !== testUrl) {
  console.error("e2e-age-user: DATABASE_URL must equal TEST_DATABASE_URL.");
  process.exit(1);
}
if (!email) {
  console.error("e2e-age-user: pass the user's email.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const res = await client.query("UPDATE users SET created_at = now() - interval '30 days' WHERE email = $1", [email]);
  console.log(`e2e-age-user: updated ${res.rowCount} user.`);
} finally {
  await client.end();
}
