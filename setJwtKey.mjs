// setJwtKey.mjs — Run once to set JWT_PRIVATE_KEY in Convex
// Usage: node setJwtKey.mjs
// This avoids the CLI argument parsing issue with PEM dashes

import { execSync } from "child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { writeFileSync, unlinkSync } from "fs";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);

// Write key to temp file to avoid shell argument parsing issues
const keyValue = privateKey.trimEnd().replace(/\n/g, " ");
writeFileSync("./tmp_jwt_key.txt", keyValue, "utf8");

console.log("Setting JWT_PRIVATE_KEY...");
try {
  execSync('npx convex env set JWT_PRIVATE_KEY "$(cat tmp_jwt_key.txt)"', {
    stdio: "inherit",
    shell: "/bin/bash",
  });
} catch (e) {
  console.error("CLI set failed — use the Convex dashboard instead!");
  console.error("Go to: https://dashboard.convex.dev");
  console.error("Add env var JWT_PRIVATE_KEY with value:");
  console.log(keyValue);
} finally {
  unlinkSync("./tmp_jwt_key.txt");
}
