"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  normalizeName,
  normalizeUrlDomain,
  scoreMatch,
  type InstituteOfNationalImportance,
} from "../../convex/actions/iniSeed";
import type { Doc } from "../../convex/_generated/dataModel";

function makeRecord(
  overrides: Partial<Doc<"universities">> & { university_name: string },
): Doc<"universities"> {
  return {
    _id: "test-id" as Doc<"universities">["_id"],
    _creationTime: Date.now(),
    university_name: overrides.university_name,
    state: overrides.state ?? undefined,
    city: overrides.city ?? undefined,
    website: overrides.website ?? undefined,
    type: overrides.type ?? undefined,
    category: overrides.category ?? undefined,
    data_source: overrides.data_source ?? undefined,
    created_at: Date.now(),
    updated_at: Date.now(),
    outreach_stage: "new",
    website_status: "pending",
    ...overrides,
  } as unknown as Doc<"universities">;
}

function makeInstitute(
  overrides: Partial<InstituteOfNationalImportance> & {
    university_name: string;
    state: string;
  },
): InstituteOfNationalImportance {
  return {
    city: undefined,
    website: "https://example.edu",
    category: "IIT",
    established_year: undefined,
    ...overrides,
  } as InstituteOfNationalImportance;
}

describe("normalizeName", () => {
  it("lowercases and removes punctuation", () => {
    assert.strictEqual(
      normalizeName("Indian Institute of Technology (BHU) Varanasi"),
      "indian institute of technology bhu varanasi",
    );
  });

  it("collapses whitespace", () => {
    assert.strictEqual(normalizeName("IIT   Delhi"), "iit delhi");
  });
});

describe("normalizeUrlDomain", () => {
  it("strips www and lowercases", () => {
    assert.strictEqual(
      normalizeUrlDomain("https://www.IITD.ac.in"),
      "iitd.ac.in",
    );
  });

  it("adds https protocol when missing", () => {
    assert.strictEqual(
      normalizeUrlDomain("nitr.ac.in"),
      "nitr.ac.in",
    );
  });

  it("returns null for empty input", () => {
    assert.strictEqual(normalizeUrlDomain(undefined), null);
  });
});

describe("scoreMatch", () => {
  it("returns 100 for exact normalized name match", () => {
    const institute = makeInstitute({
      university_name: "National Institute of Technology, Rourkela",
      state: "Odisha",
    });
    const record = makeRecord({
      university_name: "National Institute of Technology, Rourkela",
      state: "Odisha",
    });
    assert.strictEqual(scoreMatch(institute, record), 100);
  });

  it("returns 90 for exact domain match", () => {
    const institute = makeInstitute({
      university_name: "Indian Institute of Technology Delhi",
      state: "Delhi",
      website: "https://home.iitd.ac.in",
    });
    const record = makeRecord({
      university_name: "Some Other Delhi Institute",
      state: "Delhi",
      website: "https://www.home.iitd.ac.in",
    });
    assert.strictEqual(scoreMatch(institute, record), 90);
  });

  it("returns 0 when states differ", () => {
    const institute = makeInstitute({
      university_name: "Indian Institute of Technology Bombay",
      state: "Maharashtra",
    });
    const record = makeRecord({
      university_name: "Indian Institute of Technology Bombay",
      state: "Delhi",
    });
    assert.strictEqual(scoreMatch(institute, record), 0);
  });

  it("returns 0 when names differ and no domain match", () => {
    const institute = makeInstitute({
      university_name: "Indian Institute of Technology Bombay",
      state: "Maharashtra",
      website: "https://www.iitb.ac.in",
    });
    const record = makeRecord({
      university_name: "Homi Bhabha National Institute, Regd. Office",
      state: "Maharashtra",
      website: "https://www.hbni.ac.in",
    });
    assert.strictEqual(scoreMatch(institute, record), 0);
  });

  it("returns 0 when a curated record already represents a different institute", () => {
    const institute = makeInstitute({
      university_name: "Indian Institute of Technology Bombay",
      state: "Maharashtra",
      website: "https://www.iitb.ac.in",
    });
    const record = makeRecord({
      university_name: "Indian Institute of Technology Delhi",
      state: "Delhi",
      website: "https://home.iitd.ac.in",
      data_source: "curated",
    });
    assert.strictEqual(scoreMatch(institute, record), 0);
  });
});
