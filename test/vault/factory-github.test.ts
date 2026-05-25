import { test } from "node:test";
import assert from "node:assert/strict";

// Opt-in GitHub driver. Runs in its own process (node:test isolates files),
// so these env vars don't leak into the other factory test.
process.env.VAULT_SOURCE = "github";
process.env.GITHUB_TOKEN = "ghp_dummy";
process.env.GITHUB_REPO = "owner/repo";
process.env.NEON_DATABASE_URL = "postgres://dummy";
process.env.OPENAI_API_KEY = "sk-dummy";

test("getVaultSource() selects GitHubSource when VAULT_SOURCE=github", async () => {
  const { getVaultSource } = await import("../../src/vault/index.js");
  const { GitHubSource } = await import("../../src/vault/github.js");
  assert.ok(getVaultSource() instanceof GitHubSource);
});
