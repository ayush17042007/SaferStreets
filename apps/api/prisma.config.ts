// Prisma CLI config (Prisma 7). Loads the repo-root .env without overriding real env vars.
import { defineConfig } from "prisma/config";
import { loadRootDotenv } from "./src/config/dotenv.ts";

loadRootDotenv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=source prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` does not connect; a placeholder keeps it working without a database.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
