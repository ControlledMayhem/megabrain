import { fullSync } from "./sync.js";

const command = process.argv[2];

if (command === "sync" || command === "reindex") {
  console.log(`[cli] Running full sync...`);
  const result = await fullSync();
  console.log(`[cli] Done:`, result);
  process.exit(0);
} else {
  console.log("Usage: tsx src/cli.ts [sync|reindex]");
  process.exit(1);
}
