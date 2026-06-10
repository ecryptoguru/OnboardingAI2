"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  findFirstValidWebsiteCandidate,
  isSuspiciousWebsite,
  looksLikeOwnedDomain,
  rankWebsiteCandidates,
} from "../../convex/lib/discoveryCandidates";

describe("discovery candidate ranking", () => {
  it("prefers owned domains over generic results", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://admissions.example.com",
        "https://vit.ac.in",
        "https://www.linkedin.com/school/vit",
      ],
      "Vellore Institute of Technology",
    );

    assert.deepStrictEqual(
      candidates.map((candidate) => candidate.link),
      ["https://vit.ac.in", "https://admissions.example.com"],
    );
    assert.strictEqual(candidates[0]?.score, 3);
    assert.strictEqual(candidates[1]?.score, -2);
  });

  it("deduplicates repeated links and ignores malformed ownership matches", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://kiit.ac.in",
        "https://kiit.ac.in",
        "not-a-url",
        "https://www.facebook.com/kiituniversity",
      ],
      "Kalinga Institute of Industrial Technology",
    );

    assert.deepStrictEqual(
      candidates.map((candidate) => candidate.link),
      ["https://kiit.ac.in", "not-a-url"],
    );
    assert.strictEqual(candidates[0]?.score, 3);
    assert.strictEqual(candidates[1]?.score, 0);
  });

  it("prefers branch-specific candidates when location hints match", () => {
    const candidates = rankWebsiteCandidates(
      ["https://www.bitmesra.ac.in", "https://www.bitmesra.ac.in/jaipur/"],
      "Birla Institute of Technology",
      { locationHints: ["Jaipur", "Rajasthan"] },
    );

    assert.deepStrictEqual(
      candidates.map((candidate) => candidate.link),
      ["https://www.bitmesra.ac.in/jaipur/", "https://www.bitmesra.ac.in"],
    );
  });

  it("prefers cleaner root domains over equivalent mirrors", () => {
    const candidates = rankWebsiteCandidates(
      ["https://www.snu.edu.in", "https://snu.edu.in"],
      "Shiv Nadar University",
    );

    assert.deepStrictEqual(
      candidates.map((candidate) => candidate.link),
      ["https://snu.edu.in", "https://www.snu.edu.in"],
    );
  });
});

describe("owned domain heuristic", () => {
  it("matches significant university-name words in the domain root", () => {
    assert.strictEqual(
      looksLikeOwnedDomain("https://shivnadar.edu.in", "Shiv Nadar University"),
      true,
    );
  });

  it("rejects malformed or unrelated domains", () => {
    assert.strictEqual(
      looksLikeOwnedDomain(
        "https://careers.example.com",
        "Shiv Nadar University",
      ),
      false,
    );
    assert.strictEqual(
      looksLikeOwnedDomain("not-a-url", "Shiv Nadar University"),
      false,
    );
  });

  it("does not treat short acronyms as arbitrary substring matches", () => {
    assert.strictEqual(
      looksLikeOwnedDomain(
        "https://bub.ernet.in",
        "Bangalore University",
      ),
      false,
    );
    assert.strictEqual(
      looksLikeOwnedDomain(
        "https://vit.ac.in",
        "Vellore Institute of Technology",
      ),
      true,
    );
  });
});

describe("hosted portal and gov.in scoring", () => {
  it("boosts .gov.in domains for state universities", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://bangaloreuniversity.karnataka.gov.in",
        "https://bangaloreuniversity.ac.in",
        "https://some-other-portal.com",
      ],
      "Bangalore University",
    );

    const govIn = candidates.find((c) =>
      c.link.includes("karnataka.gov.in"),
    );
    const other = candidates.find((c) =>
      c.link.includes("some-other-portal.com"),
    );
    assert.ok(govIn, "gov.in candidate should exist");
    assert.ok(other, "other candidate should exist");
    assert.ok(
      (govIn?.score ?? -99) > (other?.score ?? 99),
      "gov.in should outrank non-education domain",
    );
  });

  it("filters out blocked aggregator domains", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://kiit.ac.in",
        "https://www.shiksha.com/kiit-university",
        "https://www.collegedunia.com/university/kiit",
      ],
      "Kalinga Institute of Industrial Technology",
    );

    assert.strictEqual(
      candidates.some((c) => c.link.includes("shiksha.com")),
      false,
    );
    assert.strictEqual(
      candidates.some((c) => c.link.includes("collegedunia.com")),
      false,
    );
  });
});

describe("discovery candidate fallback", () => {
  it("returns the first candidate that validates successfully", async () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://snu.edu.in",
        "https://admissions.partner-site.com",
        "https://www.snu.edu.in",
      ],
      "Shiv Nadar University",
    );

    const attempts: string[] = [];
    const selected = await findFirstValidWebsiteCandidate(
      candidates,
      async (candidate) => {
        attempts.push(candidate.link);
        return candidate.link === "https://www.snu.edu.in";
      },
    );

    assert.strictEqual(selected?.link, "https://www.snu.edu.in");
    assert.deepStrictEqual(attempts, [
      "https://snu.edu.in",
      "https://www.snu.edu.in",
    ]);
  });

  it("continues to fallback candidates after validator errors", async () => {
    const candidates = rankWebsiteCandidates(
      ["https://annauniv.edu", "https://annauniv.edu.in"],
      "Anna University",
    );

    const selected = await findFirstValidWebsiteCandidate(
      candidates,
      async (candidate) => {
        if (candidate.link === "https://annauniv.edu") {
          throw new Error("timeout");
        }
        return true;
      },
    );

    assert.strictEqual(selected?.link, "https://annauniv.edu.in");
  });
});

describe("hosted portal detection", () => {
  it("identifies known hosted portal domains and assigns negative scores", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://myuni.wordpress.com",
        "https://myuni.inhawk.com",
        "https://myuni.wixsite.com",
        "https://myuni.webs.com",
        "https://sites.google.com/view/myuni",
      ],
      "My University",
    );
    // Hosted portals that are not owned and have no education TLD get:
    // 0 (base) - 2 (non-owned/non-education) - 6 (hosted) = -8
    candidates.forEach((c) => {
      assert.strictEqual(c.score, -8);
    });
  });
});

describe("education TLD detection", () => {
  it("recognizes .gov.in as an education TLD", () => {
    const candidates = rankWebsiteCandidates(
      ["https://example.gov.in"],
      "Some Other University",
    );
    // Non-owned .gov.in: +1 (education TLD) + 2 (.gov.in bonus) = 3
    assert.strictEqual(candidates[0]?.score, 3);
  });
});

describe("candidate scoring penalties and boosts", () => {
  it("penalizes hosted portals by -6 relative to non-hosted", () => {
    const portal = rankWebsiteCandidates(
      ["https://myuni.wordpress.com"],
      "Some Other University",
    );
    const generic = rankWebsiteCandidates(
      ["https://myuni.example.com"],
      "Some Other University",
    );
    // portal: -8, generic: -2. Difference is -6.
    assert.strictEqual(portal[0]!.score - generic[0]!.score, -6);
  });

  it("penalizes non-owned non-education domains by -2", () => {
    const candidates = rankWebsiteCandidates(
      ["https://example.com"],
      "Some University Name",
    );
    assert.strictEqual(candidates[0]?.score, -2);
  });

  it("boosts .gov.in domains by +2 over other education TLDs", () => {
    const gov = rankWebsiteCandidates(
      ["https://example.gov.in"],
      "Some Other University",
    );
    const ac = rankWebsiteCandidates(
      ["https://example.ac.in"],
      "Some Other University",
    );
    // gov.in: +3, ac.in: +1. Difference is 2.
    assert.strictEqual(gov[0]!.score - ac[0]!.score, 2);
  });

  it("boosts owned domains by +2", () => {
    const owned = rankWebsiteCandidates(
      ["https://vit.ac.in"],
      "Vellore Institute of Technology",
    );
    const notOwned = rankWebsiteCandidates(
      ["https://vit.ac.in"],
      "Some Other University",
    );
    // owned: +3, notOwned: +1. Difference is 2.
    assert.strictEqual(owned[0]!.score - notOwned[0]!.score, 2);
  });
});

describe("suspicious website detection", () => {
  it("flags known hosted-portal domains", () => {
    assert.strictEqual(
      isSuspiciousWebsite("https://buofc.inhawk.com"),
      true,
    );
    assert.strictEqual(
      isSuspiciousWebsite("https://mysite.wordpress.com"),
      true,
    );
    assert.strictEqual(
      isSuspiciousWebsite("https://example.wixsite.com/foo"),
      true,
    );
  });

  it("flags blocked aggregator domains", () => {
    assert.strictEqual(
      isSuspiciousWebsite("https://www.shiksha.com/kiit"),
      true,
    );
    assert.strictEqual(
      isSuspiciousWebsite("https://collegedunia.com/university/vit"),
      true,
    );
  });

  it("returns false for legitimate education domains", () => {
    assert.strictEqual(
      isSuspiciousWebsite("https://www.bhu.ac.in"),
      false,
    );
    assert.strictEqual(
      isSuspiciousWebsite("https://bangaloreuniversity.karnataka.gov.in"),
      false,
    );
    assert.strictEqual(
      isSuspiciousWebsite("https://kiit.ac.in"),
      false,
    );
  });

  it("handles null, empty, and malformed URLs gracefully", () => {
    assert.strictEqual(isSuspiciousWebsite(null), false);
    assert.strictEqual(isSuspiciousWebsite(""), false);
    assert.strictEqual(isSuspiciousWebsite("not-a-url"), false);
  });
});

describe("blocked domains filtering", () => {
  it("filters out aggregator and social media sites", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://en.wikipedia.org/wiki/Example",
        "https://shiksha.com/example",
        "https://collegedunia.com/example",
        "https://careers360.com/example",
        "https://example.ac.in",
      ],
      "Example University",
    );
    assert.deepStrictEqual(
      candidates.map((c) => c.link),
      ["https://example.ac.in"],
    );
  });

  it("also blocks inhawk.com aggregator domain", () => {
    const candidates = rankWebsiteCandidates(
      [
        "https://myuni.inhawk.com",
        "https://example.ac.in",
      ],
      "Example University",
    );
    assert.deepStrictEqual(
      candidates.map((c) => c.link),
      ["https://example.ac.in"],
    );
  });
});
