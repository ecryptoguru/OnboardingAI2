"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { rankBlocksForExtraction } from "../../convex/lib/perSourceExtraction";

describe("rankBlocksForExtraction", () => {
  it("ranks the officers/administration block above generic pages", () => {
    const blocks = [
      "=== SOURCE: https://uni.edu/about ===\nWelcome to our university. History and vision.",
      "=== SOURCE: https://uni.edu/news ===\nLatest placements and events.",
      "=== SOURCE: https://uni.edu/officers ===\nOfficers of the University\nDr. A Sharma, Vice Chancellor\nDr. B Rao, Registrar",
    ];
    const ranked = rankBlocksForExtraction(blocks);
    assert.strictEqual(ranked[0], blocks[2]);
  });

  it("boosts blocks whose body names leadership roles", () => {
    const blocks = [
      "=== SOURCE: https://uni.edu/people ===\nThe Vice Chancellor, Registrar and Deans are listed below.",
      "=== SOURCE: https://uni.edu/people ===\nFaculty members and staff profiles.",
    ];
    const ranked = rankBlocksForExtraction(blocks);
    assert.strictEqual(ranked[0], blocks[0]);
  });

  it("keeps all blocks (only reorders)", () => {
    const blocks = ["a", "b", "c"].map(
      (id, i) => `=== SOURCE: https://uni.edu/${id} ===\nbody ${i}`,
    );
    const ranked = rankBlocksForExtraction(blocks);
    assert.strictEqual(ranked.length, blocks.length);
    assert.deepStrictEqual([...ranked].sort(), [...blocks].sort());
  });
});
