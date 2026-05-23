import { neon } from "@neondatabase/serverless";
import { config } from "./config.js";

const sql = neon(config.neonDatabaseUrl);

// --- Upsert a note with its embedding ---
export async function upsertNote(note: {
  path: string;
  title: string;
  content: string;
  tags: string[];
  folder: string;
  createdAt: Date | null;
  updatedAt: Date;
  embedding: number[];
}) {
  await sql`
    INSERT INTO notes (path, title, content, tags, folder, created_at, updated_at, last_indexed, embedding)
    VALUES (
      ${note.path},
      ${note.title},
      ${note.content},
      ${note.tags},
      ${note.folder},
      ${note.createdAt?.toISOString() ?? null},
      ${note.updatedAt.toISOString()},
      NOW(),
      ${JSON.stringify(note.embedding)}::vector
    )
    ON CONFLICT (path) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      tags = EXCLUDED.tags,
      folder = EXCLUDED.folder,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      last_indexed = NOW(),
      embedding = EXCLUDED.embedding
  `;
}

// --- Semantic search ---
export async function searchNotes(params: {
  embedding: number[];
  limit: number;
  filterTags?: string[];
  filterFolder?: string;
}) {
  const { embedding, limit, filterTags, filterFolder } = params;
  const embeddingStr = JSON.stringify(embedding);

  if (filterFolder && filterTags && filterTags.length > 0) {
    return sql`
      SELECT path, title, LEFT(content, 200) as excerpt,
             1 - (embedding <=> ${embeddingStr}::vector) as similarity,
             tags, folder, updated_at
      FROM notes
      WHERE embedding IS NOT NULL
        AND folder = ${filterFolder}
        AND tags && ${filterTags}::text[]
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
  }

  if (filterFolder) {
    return sql`
      SELECT path, title, LEFT(content, 200) as excerpt,
             1 - (embedding <=> ${embeddingStr}::vector) as similarity,
             tags, folder, updated_at
      FROM notes
      WHERE embedding IS NOT NULL AND folder = ${filterFolder}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
  }

  if (filterTags && filterTags.length > 0) {
    return sql`
      SELECT path, title, LEFT(content, 200) as excerpt,
             1 - (embedding <=> ${embeddingStr}::vector) as similarity,
             tags, folder, updated_at
      FROM notes
      WHERE embedding IS NOT NULL AND tags && ${filterTags}::text[]
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
  }

  return sql`
    SELECT path, title, LEFT(content, 200) as excerpt,
           1 - (embedding <=> ${embeddingStr}::vector) as similarity,
           tags, folder, updated_at
    FROM notes
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
}

// --- Get a single note by path ---
export async function getNote(path: string) {
  const rows = await sql`
    SELECT path, title, content, tags, folder, created_at, updated_at
    FROM notes WHERE path = ${path}
  `;
  return rows[0] ?? null;
}

// --- List notes with filters ---
export async function listNotes(params: {
  folder?: string;
  tags?: string[];
  updatedAfter?: string;
  limit?: number;
}) {
  const { folder, tags, updatedAfter, limit = 50 } = params;

  // Build query with available filters using tagged templates
  if (folder && tags && tags.length > 0 && updatedAfter) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE folder = ${folder} AND tags && ${tags}::text[] AND updated_at >= ${updatedAfter}
      ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  if (folder && tags && tags.length > 0) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE folder = ${folder} AND tags && ${tags}::text[]
      ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  if (folder && updatedAfter) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE folder = ${folder} AND updated_at >= ${updatedAfter}
      ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  if (tags && tags.length > 0 && updatedAfter) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE tags && ${tags}::text[] AND updated_at >= ${updatedAfter}
      ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  if (folder) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE folder = ${folder} ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  if (tags && tags.length > 0) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE tags && ${tags}::text[] ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  if (updatedAfter) {
    return sql`SELECT path, title, tags, folder, updated_at FROM notes
      WHERE updated_at >= ${updatedAfter} ORDER BY updated_at DESC LIMIT ${limit}`;
  }
  return sql`SELECT path, title, tags, folder, updated_at FROM notes
    ORDER BY updated_at DESC LIMIT ${limit}`;
}

// --- Delete notes that no longer exist in the vault ---
export async function deleteNotes(paths: string[]) {
  if (paths.length === 0) return;
  await sql`DELETE FROM notes WHERE path = ANY(${paths})`;
}

// --- Get all indexed paths with their updated_at ---
export async function getIndexedPaths(): Promise<
  { path: string; updated_at: string }[]
> {
  const rows = await sql`SELECT path, updated_at FROM notes ORDER BY path`;
  return rows as { path: string; updated_at: string }[];
}
