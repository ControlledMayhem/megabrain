/**
 * VaultSource — the pluggable abstraction over "where the Markdown vault lives".
 *
 * MegaBrain's indexer, MCP tools, and REST API only ever talk to this interface.
 * Drivers (local folder, GitHub, …) implement it. The audit confirmed the
 * embeddings + DB layers are already source-neutral, so this is the single seam
 * that decides how notes are read and written.
 */

export interface VaultFile {
  /** Vault-relative POSIX path, e.g. "projects/foo.md". */
  path: string;
  /** Content hash, when the driver exposes one (GitHub blob SHA). Optional. */
  sha?: string;
  /** Last-modified time, used for mtime-based incremental sync. */
  lastModified: Date;
}

export interface VaultChanges {
  /** Paths created or modified since the requested point. */
  changed: string[];
  /** Paths removed since the requested point (when the driver can tell). */
  removed: string[];
}

export interface VaultSource {
  /** List all `.md` files in the vault with their last-modified times. */
  list(): Promise<VaultFile[]>;

  /** Read a file's UTF-8 content. Throws if the path does not exist. */
  read(path: string): Promise<string>;

  /**
   * Create or update a file.
   * `message` is a commit message for drivers that version (e.g. git); drivers
   * that write a plain file (local folder) ignore it.
   */
  write(path: string, content: string, message?: string): Promise<void>;

  /** Delete a file. `message` behaves as in {@link VaultSource.write}. */
  delete(path: string, message?: string): Promise<void>;

  /**
   * Files changed (and removed, when the driver can determine it) since `since`.
   * Used for incremental sync. With no argument, returns every file as changed.
   *
   * Note: removal reconciliation is also handled by `fullSync`, which diffs the
   * full `list()` against the index — so drivers that cannot cheaply detect
   * removals may return `removed: []` here and rely on the periodic full sync.
   */
  changedFiles(since?: Date): Promise<VaultChanges>;
}
