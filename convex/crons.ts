import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ─── Outreach cadence: check for due sequences every 15 minutes ──────────────
crons.interval(
  "process-outreach-sequences",
  { minutes: 15 },
  internal.actions.outreach.processDueSequences,
  {},
);

crons.cron(
  "weekly-cleanup",
  "0 0 * * 0",
  internal.proposals.cleanupOldProposalsInternal,
  { days: 30 },
);

export default crons;
