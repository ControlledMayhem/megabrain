import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

// Default driver: no VAULT_SOURCE, and crucially NO GitHub vars set.
// This guards the "app boots in local mode without any GitHub config" contract.
process.env.MEGABRAIN_VAULT_PATH = os.tmpdir();
process.env.NEON_DATABASE_URL = "postgres://dummy";
process.env.OPENAI_API_KEY = "sk-dummy";
delete process.env.VAULT_SOURCE;
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_REPO;

test("getVaultSource() defaults to LocalFolderSource with no GitHub vars set", async () => {
  const { getVaultSource } = await import("../../src/vault/index.js");
  const { LocalFolderSource } = await import("../../src/vault/local.js");
  assert.ok(getVaultSource() instanceof LocalFolderSource);
});
