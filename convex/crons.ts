import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// ─── Outreach cadence: check for due sequences every hour ─────────────────────
crons.hourly(
  "process-outreach-sequences",
  { minuteUTC: 0 },
  (api.actions as any).outreach.processDueSequences
);

crons.weekly(
  "weekly-cleanup",
  { dayOfWeek: "sunday", hourUTC: 0, minuteUTC: 0 },
  internal.proposals.cleanupOldProposalsInternal,
  { days: 30 }
);

export default crons;
