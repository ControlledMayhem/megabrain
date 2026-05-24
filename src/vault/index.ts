import { config } from "../config.js";
import type { VaultSource } from "./source.js";
import { LocalFolderSource } from "./local.js";
import { GitHubSource } from "./github.js";

let cached: VaultSource | null = null;

/**
 * Return the configured vault driver (constructed once and cached).
 *
 * VAULT_SOURCE=local  (default) → LocalFolderSource, rooted at MEGABRAIN_VAULT_PATH
 * VAULT_SOURCE=github           → GitHubSource (requires GITHUB_TOKEN + GITHUB_REPO)
 */
export function getVaultSource(): VaultSource {
  if (cached) return cached;
  cached =
    config.vaultSource === "github"
      ? new GitHubSource()
      : new LocalFolderSource(config.vaultPath);
  return cached;
}

export type { VaultSource, VaultFile, VaultChanges } from "./source.js";
