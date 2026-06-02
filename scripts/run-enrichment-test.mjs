/**
 * Script to run wipeAndEnrich on KIIT and print the results.
 * Usage: node scripts/run-enrichment-test.mjs
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = "https://exuberant-snake-522.convex.cloud";
const KIIT_ID = "jx74rfvcs927fdtyksp5hga0nh87tmg2";

async function main() {
  console.log("Connecting to Convex dev deployment...");
  const client = new ConvexHttpClient(CONVEX_URL);

  // Try with no auth first - the action itself doesn't call validateAuth
  console.log("Running wipeAndEnrich for KIIT...");
  console.log("(This may take 60-120 seconds)...");

  const start = Date.now();
  try {
    const result = await client.action(
      "actions/testEnrichmentLoop:wipeAndEnrich",
      { universityId: KIIT_ID }
    );
    const elapsed = Date.now() - start;

    console.log("\n========== ENRICHMENT COMPLETE ==========");
    console.log(`Elapsed: ${elapsed}ms`);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Action failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
