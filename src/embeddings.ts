import OpenAI from "openai";
import { config } from "./config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Generate an embedding for a note.
 * Concatenates title + tags + content for better semantic coverage.
 */
export async function generateEmbedding(note: {
  title: string;
  tags: string[];
  content: string;
}): Promise<number[]> {
  const input = [
    note.title,
    note.tags.length > 0 ? `Tags: ${note.tags.join(", ")}` : "",
    note.content,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Truncate to ~8000 tokens (~32000 chars) to stay within model limits
  const truncated = input.slice(0, 32000);

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: truncated,
  });

  return response.data[0].embedding;
}

/**
 * Generate embedding for a search query.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  return response.data[0].embedding;
}
