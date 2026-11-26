// Single build, two behaviours:
// ROLE=server (HTTP API) or ROLE=worker (pg-boss jobs).

import { loadEnv } from "./config/env.js";

const env = loadEnv();

if (env.ROLE === "worker") {
  const { startWorker } = await import("./worker.js");
  await startWorker(env);
} else {
  const { startServer } = await import("./server.js");
  await startServer(env);
}
