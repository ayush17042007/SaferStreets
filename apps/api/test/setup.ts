import { afterAll, beforeEach } from "vitest";
import { pool, prisma, truncateAll } from "./helpers.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});
