import { getVaultSource } from "./vault/index.js";
import { generateEmbedding } from "./embeddings.js";
import { upsertNote, deleteNotes, getIndexedPaths } from "./db.js";
import { parseFrontmatter } from "./frontmatter.js";

const vault = getVaultSource();

/**
 * Full sync: compare vault state with DB, process differences.
 */
export async function fullSync(): Promise<{
  processed: number;
  deleted: number;
  skipped: number;
}> {
  console.log("[sync] Starting full sync...");

  const [vaultFiles, indexedRows] = await Promise.all([
    vault.list(),
    getIndexedPaths(),
  ]);

  const indexedMap = new Map(
    indexedRows.map((r) => [r.path, new Date(r.updated_at)])
  );

  let processed = 0;
  let skipped = 0;

  // Process new or modified files
  for (const file of vaultFiles) {
    const indexedAt = indexedMap.get(file.path);

    // Skip if already indexed and not modified since
    if (indexedAt && file.lastModified <= indexedAt) {
      skipped++;
      continue;
    }

    try {
      await processFile(file.path);
      processed++;
    } catch (err) {
      console.error(`[sync] Failed to process ${file.path}:`, err);
    }
  }

  // Delete notes that no longer exist in vault
  const vaultPaths = new Set(vaultFiles.map((f) => f.path));
  const toDelete = indexedRows
    .filter((r) => !vaultPaths.has(r.path))
    .map((r) => r.path);

  if (toDelete.length > 0) {
    await deleteNotes(toDelete);
    console.log(`[sync] Deleted ${toDelete.length} removed notes`);
  }

  console.log(
    `[sync] Done: ${processed} processed, ${skipped} skipped, ${toDelete.length} deleted`
  );

  return { processed, deleted: toDelete.length, skipped };
}

/**
 * Incremental sync: process only the specified changed/removed files.
 */
export async function incrementalSync(
  changed: string[],
  removed: string[]
): Promise<{ processed: number; deleted: number }> {
  console.log(
    `[sync] Incremental: ${changed.length} changed, ${removed.length} removed`
  );

  let processed = 0;

  for (const path of changed) {
    try {
      await processFile(path);
      processed++;
    } catch (err) {
      console.error(`[sync] Failed to process ${path}:`, err);
    }
  }

  if (removed.length > 0) {
    await deleteNotes(removed);
  }

  console.log(`[sync] Done: ${processed} processed, ${removed.length} deleted`);

  return { processed, deleted: removed.length };
}

/**
 * Process a single file: fetch content, parse, embed, upsert.
 */
async function processFile(path: string): Promise<void> {
  console.log(`[sync] Processing: ${path}`);

  const raw = await vault.read(path);
  const { frontmatter, content } = parseFrontmatter(raw);

  const title =
    (typeof frontmatter.title === "string" ? frontmatter.title : null) ??
    content.match(/^#\s+(.+)$/m)?.[1] ??
    path.split("/").pop()?.replace(".md", "") ??
    path;

  const tags: string[] = Array.isArray(frontmatter.tags)
    ? (frontmatter.tags as string[])
    : typeof frontmatter.tags === "string"
      ? frontmatter.tags.split(",").map((t) => t.trim())
      : [];

  const folder = path.includes("/") ? path.split("/")[0] : "";

  const createdAt =
    typeof frontmatter.created === "string"
      ? new Date(frontmatter.created)
      : typeof frontmatter.date === "string"
        ? new Date(frontmatter.date)
        : null;

  const embedding = await generateEmbedding({ title, tags, content });

  await upsertNote({
    path,
    title,
    content,
    tags,
    folder,
    createdAt,
    updatedAt: new Date(),
    embedding,
  });
}
