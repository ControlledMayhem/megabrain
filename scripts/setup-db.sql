-- MegaBrain: Neon PostgreSQL schema
-- Run this once against your Neon database

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path         TEXT NOT NULL UNIQUE,
  title        TEXT,
  content      TEXT NOT NULL,
  tags         TEXT[] DEFAULT '{}',
  folder       TEXT,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_indexed TIMESTAMPTZ,
  embedding    VECTOR(1536)
);

-- Semantic search index
CREATE INDEX IF NOT EXISTS notes_embedding_idx
  ON notes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Fast lookups by path
CREATE INDEX IF NOT EXISTS notes_path_idx ON notes (path);

-- Filter queries
CREATE INDEX IF NOT EXISTS notes_folder_idx ON notes (folder);
CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING gin (tags);
CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (updated_at);
