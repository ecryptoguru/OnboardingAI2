import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// ─── Outreach cadence: check for due sequences every hour ─────────────────────
crons.interval(
  "process-outreach-sequences",
  { hours: 1 },
  api.actions.outreach.processDueSequences,
  {},
);

crons.cron(
  "weekly-cleanup",
  "0 0 * * 0",
  internal.proposals.cleanupOldProposalsInternal,
  { days: 30 },
);

export default crons;
