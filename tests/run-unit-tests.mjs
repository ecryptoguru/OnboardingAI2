#!/usr/bin/env node
/**
 * Unit test runner using Node.js built-in test runner + tsx.
 * Usage: node tests/run-unit-tests.mjs
 */

import { spawnSync } from "child_process";
import { globSync } from "fs";

const files = globSync("tests/unit/**/*.test.ts");

if (files.length === 0) {
  console.log("No unit test files found.");
  process.exit(0);
}

console.log(`Running ${files.length} unit test file(s)...\n`);

const result = spawnSync("npx", ["tsx", "--test", ...files], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 0);
