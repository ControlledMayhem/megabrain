import { fullSync } from "./sync.js";
import crypto from "node:crypto";

const command = process.argv[2];

if (command === "sync" || command === "reindex") {
  console.log(`[cli] Running full sync...`);
  const result = await fullSync();
  console.log(`[cli] Done:`, result);
  process.exit(0);
} else if (command === "gen-key") {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: tsx src/cli.ts gen-key <name>");
    console.error("Example: tsx src/cli.ts gen-key bob");
    process.exit(1);
  }
  const key = crypto.randomBytes(32).toString("hex");
  console.log(`\nKey for ${name}:`);
  console.log(`  ${name}:${key}`);
  console.log(`\nAdd to API_KEYS in Railway (comma-separated):`);
  console.log(`  API_KEYS=...,${name}:${key}\n`);
  process.exit(0);
} else {
  console.log("Usage: tsx src/cli.ts [sync|reindex|gen-key <name>]");
  process.exit(1);
}
