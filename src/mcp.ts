import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchNotes, getNote, listNotes } from "./db.js";
import { generateQueryEmbedding } from "./embeddings.js";
import { getVaultSource } from "./vault/index.js";

export function createMcpServer(): McpServer {
  const vault = getVaultSource();
  const server = new McpServer({
    name: "megabrain",
    version: "1.0.0",
  });

  // --- search_brain ---
  server.tool(
    "search_brain",
    "Search the Obsidian vault semantically. Finds notes by meaning, not just keywords.",
    {
      query: z.string().describe("What to search for"),
      limit: z.number().optional().default(5).describe("Max results (default 5)"),
      filter_tags: z.array(z.string()).optional().describe("Filter by tags"),
      filter_folder: z.string().optional().describe("Filter by folder"),
    },
    async ({ query, limit, filter_tags, filter_folder }) => {
      const embedding = await generateQueryEmbedding(query);
      const results = await searchNotes({
        embedding,
        limit,
        filterTags: filter_tags,
        filterFolder: filter_folder,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  // --- get_note ---
  server.tool(
    "get_note",
    "Get the full content of a specific note by its path.",
    {
      path: z.string().describe("Path to the note (e.g. 'projects/my-project/readme.md')"),
    },
    async ({ path }) => {
      const note = await getNote(path);

      if (!note) {
        return {
          content: [{ type: "text" as const, text: `Note not found: ${path}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(note, null, 2) }],
      };
    }
  );

  // --- list_notes ---
  server.tool(
    "list_notes",
    "List notes in the vault. Filter by folder, tags, or date range.",
    {
      folder: z.string().optional().describe("Filter by folder"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      updated_after: z
        .string()
        .optional()
        .describe("Only notes updated after this date (ISO format)"),
      limit: z.number().optional().default(50).describe("Max results"),
    },
    async ({ folder, tags, updated_after, limit }) => {
      const results = await listNotes({
        folder,
        tags,
        updatedAfter: updated_after,
        limit,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // --- add_note ---
  server.tool(
    "add_note",
    "Create or update a note in the vault. Requires user confirmation.",
    {
      path: z.string().describe("Path for the note (e.g. 'inbox/new-idea.md')"),
      content: z.string().describe("Markdown content of the note"),
    },
    async ({ path, content }) => {
      await vault.write(path, content, `Add note: ${path}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Note written to vault: ${path}. It will be indexed automatically on next sync.`,
          },
        ],
      };
    }
  );

  // --- update_note ---
  server.tool(
    "update_note",
    "Update part of an existing note. Reads the current content, applies your changes, and writes it back. Use this to correct or modify specific information without rewriting the entire note.",
    {
      path: z.string().describe("Path to the note to update"),
      old_text: z.string().describe("The exact text to find and replace"),
      new_text: z.string().describe("The replacement text (use empty string to delete the old text)"),
    },
    async ({ path, old_text, new_text }) => {
      let content: string;
      try {
        content = await vault.read(path);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Note not found: ${path}` }],
          isError: true,
        };
      }

      if (!content.includes(old_text)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Could not find the specified text in ${path}. Use get_note to read the current content first.`,
            },
          ],
          isError: true,
        };
      }

      const updated = content.replace(old_text, new_text);
      await vault.write(path, updated, `Update note: ${path}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Note updated: ${path}. Changed "${old_text.slice(0, 50)}..." → "${new_text.slice(0, 50)}..."`,
          },
        ],
      };
    }
  );

  // --- delete_note ---
  server.tool(
    "delete_note",
    "Delete a note from the vault. Requires user confirmation.",
    {
      path: z.string().describe("Path to the note to delete"),
    },
    async ({ path }) => {
      try {
        await vault.delete(path, `Delete note: ${path}`);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Note not found: ${path}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Note deleted: ${path}. It will be removed from the index on next sync.`,
          },
        ],
      };
    }
  );

  return server;
}
