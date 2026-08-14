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

// Website re-validation cron disabled: we now only run fetch/Jina-based checks
// manually or through explicit non-Serper discovery.
// crons.interval(
//   "website-validation-batch",
//   { minutes: 10 },
//   internal.dispatcherInternal.dispatchWebsiteValidationInternal,
//   { status: "all", limit: 50 },
// );

export default crons;
