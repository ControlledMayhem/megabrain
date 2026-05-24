import * as gh from "../github.js";
import type { VaultSource, VaultFile, VaultChanges } from "./source.js";

/**
 * GitHubSource — opt-in driver (VAULT_SOURCE=github). A thin adapter over the
 * existing, audited `src/github.ts` Octokit functions, so GitHub-backed
 * behaviour (and the Neon + Railway deploy) is byte-for-byte unchanged.
 */
export class GitHubSource implements VaultSource {
  list(): Promise<VaultFile[]> {
    return gh.listVaultFiles();
  }

  read(path: string): Promise<string> {
    return gh.getFileContent(path);
  }

  write(path: string, content: string, message?: string): Promise<void> {
    return gh.writeFile(path, content, message ?? `Update note: ${path}`);
  }

  delete(path: string, message?: string): Promise<void> {
    return gh.deleteFile(path, message ?? `Delete note: ${path}`);
  }

  async changedFiles(since?: Date): Promise<VaultChanges> {
    // listVaultFiles already resolves each file's last-commit date, so mtime
    // filtering mirrors the local driver. Push-event-driven incremental sync
    // uses parseGitHubPushPayload below instead.
    const files = await gh.listVaultFiles();
    const changed = since
      ? files.filter((f) => f.lastModified > since).map((f) => f.path)
      : files.map((f) => f.path);
    return { changed, removed: [] };
  }
}

/**
 * Parse a GitHub push webhook payload into changed/removed `.md` paths.
 * GitHub-specific — used only by the webhook route, which is registered only
 * when VAULT_SOURCE=github.
 */
export const parseGitHubPushPayload = gh.getChangedFiles;
