import { promises as fs } from "node:fs";
import path from "node:path";
import type { VaultSource, VaultFile, VaultChanges } from "./source.js";

/**
 * LocalFolderSource — the default driver. Reads and writes a real folder of
 * Markdown on disk. No git assumptions: the folder can be kept current by any
 * means (Syncthing, rsync, Gitea, GitHub, or just editing in place).
 *
 * Incremental sync is mtime-based — no filesystem watcher and no webhook. The
 * 10-minute cron `fullSync` works against this source unchanged.
 */
export class LocalFolderSource implements VaultSource {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolve a vault-relative path to an absolute one, refusing to escape root. */
  private abs(rel: string): string {
    const resolved = path.resolve(this.root, rel);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes vault root: ${rel}`);
    }
    return resolved;
  }

  /** Recursively collect `.md` files, skipping dotfiles/dirs (.git, .obsidian, .trash). */
  private async walk(dir: string, acc: string[]): Promise<string[]> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return acc;
      throw err;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, acc);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        acc.push(full);
      }
    }
    return acc;
  }

  async list(): Promise<VaultFile[]> {
    const absFiles = await this.walk(this.root, []);
    const files: VaultFile[] = [];

    for (const full of absFiles) {
      const stat = await fs.stat(full);
      files.push({
        // Normalise to POSIX separators so paths match across OSes and the DB.
        path: path.relative(this.root, full).split(path.sep).join("/"),
        lastModified: stat.mtime,
      });
    }

    return files;
  }

  async read(rel: string): Promise<string> {
    return fs.readFile(this.abs(rel), "utf-8");
  }

  async write(rel: string, content: string): Promise<void> {
    const target = this.abs(rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf-8");
  }

  async delete(rel: string): Promise<void> {
    await fs.rm(this.abs(rel), { force: true });
  }

  async changedFiles(since?: Date): Promise<VaultChanges> {
    const files = await this.list();
    const changed = since
      ? files.filter((f) => f.lastModified > since).map((f) => f.path)
      : files.map((f) => f.path);

    // Removal reconciliation is handled by fullSync's index diff.
    return { changed, removed: [] };
  }
}
