import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKeyPem = await exportPKCS8(keys.privateKey);
const publicKeyJwk = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKeyJwk }] });

writeFileSync("./jwt_key_tmp.pem", privateKeyPem, "utf8");

console.log("Setting JWKS...");
// We use '--' to tell convex env set that the following arg is a value, not a flag
execSync(`npx convex env set JWKS -- '${jwks}'`, { stdio: "inherit", shell: "/bin/bash" });

console.log("Setting JWT_PRIVATE_KEY with proper newlines...");
// The '--' stops the CLI from parsing "-----BEGIN..." as an option
execSync(`npx convex env set JWT_PRIVATE_KEY -- "$(cat jwt_key_tmp.pem)"`, {
  stdio: "inherit",
  shell: "/bin/bash",
});

unlinkSync("./jwt_key_tmp.pem");
console.log("Keys generated and set successfully and correctly matching!");
