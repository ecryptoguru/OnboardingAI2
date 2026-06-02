/**
 * Quick sanity test for the embedding function.
 * Run: npx tsx tests/unit/embed.test.ts
 */

import { embed } from "../../convex/lib/llm";

async function test() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ No GOOGLE_API_KEY or GEMINI_API_KEY env var set");
    process.exit(1);
  }

  console.log("Testing embedding with text-embedding-005...");
  try {
    const vector = await embed("Kalinga Institute of Industrial Technology is a university in Odisha, India.", apiKey);

    if (!Array.isArray(vector)) {
      console.error("❌ Result is not an array");
      process.exit(1);
    }

    if (vector.length !== 768) {
      console.error(`❌ Expected 768 dimensions, got ${vector.length}`);
      process.exit(1);
    }

    // Sanity: values should be floats, not NaN or Infinity
    const hasInvalid = vector.some((v) => !Number.isFinite(v));
    if (hasInvalid) {
      console.error("❌ Vector contains non-finite values");
      process.exit(1);
    }

    console.log(`✅ Embedding OK: ${vector.length} dims, sample=[${vector.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}...]`);
    process.exit(0);
  } catch (err) {
    console.error("❌ embed() threw:", err);
    process.exit(1);
  }
}

test();
