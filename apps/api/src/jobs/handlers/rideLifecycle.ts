import { runRideLifecycle } from "../../modules/rides/rides.lifecycle.js";
import { JOB_NAMES, defineJob } from "../registry.js";

export const rideLifecycleJob = defineJob({
  name: JOB_NAMES.rideLifecycle,
  schedule: { cron: "*/5 * * * *" },
  retryLimit: 2,
  retryDelaySeconds: 10,
  retryDelayMaxSeconds: 60,
  expireInSeconds: 120,
  handler: async (_data, ctx) => {
    const r = await runRideLifecycle(ctx.prisma, ctx.clock);
    if (r.started || r.completed || r.expired) ctx.log.info(r, "ride lifecycle moved rows");
  },
});
