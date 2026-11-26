// Test helper for Playwright: optionally promote a registered user and give them one unread notification.
// Usage: tsx scripts/e2e-prepare-user.ts --email a@b.test [--role ADMIN] [--notify]
// Refuses to run against anything that is not the configured test database.
import pg from "pg";

const url = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!url || !testUrl || url !== testUrl) {
  console.error("e2e-prepare-user: DATABASE_URL must equal TEST_DATABASE_URL.");
  process.exit(1);
}
const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const email = arg("--email")?.toLowerCase();
const role = arg("--role");
if (!email) {
  console.error("e2e-prepare-user: --email is required.");
  process.exit(1);
}
if (role && !["USER", "MODERATOR", "ADMIN"].includes(role)) {
  console.error("e2e-prepare-user: bad --role.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const found = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  const id = found.rows[0]?.id;
  if (!id) throw new Error("no such user");
  if (role) await client.query('UPDATE users SET role = $2::"UserRole" WHERE id = $1', [id, role]);
  if (argv.includes("--notify")) {
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, 'REPORT_STATUS', 'Your report is under review', 'A moderator is looking at it.', '/saferoute')`,
      [id],
    );
  }
  console.log("e2e-prepare-user: done.");
} finally {
  await client.end();
}
