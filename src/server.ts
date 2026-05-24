import express from "express";
import crypto from "node:crypto";
import { config } from "./config.js";
import { fullSync, incrementalSync } from "./sync.js";
import { getVaultSource } from "./vault/index.js";
import { parseGitHubPushPayload } from "./vault/github.js";
import { searchNotes, getNote, listNotes } from "./db.js";
import { generateQueryEmbedding } from "./embeddings.js";
import { createMcpServer } from "./mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.apiKey) { next(); return; } // disabled in dev if not set
  const bearer = req.headers["authorization"];
  const keyHeader = req.headers["x-api-key"] as string | undefined;
  const queryKey = req.query.key as string | undefined;
  const provided = bearer?.startsWith("Bearer ") ? bearer.slice(7) : (keyHeader ?? queryKey);
  if (!provided || provided !== config.apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function createServer() {
  const app = express();
  const vault = getVaultSource();

  // --- Health check ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "megabrain", timestamp: new Date().toISOString() });
  });

  // --- GitHub webhook (only when the github driver is active) ---
  // The local driver has no webhook — it relies on the periodic cron fullSync.
  if (config.vaultSource === "github") {
    app.post(
      "/webhook/github",
      express.json({ limit: "5mb" }),
      async (req, res) => {
        // Verify signature if secret is configured
        if (config.githubWebhookSecret) {
          const sig = req.headers["x-hub-signature-256"] as string | undefined;
          if (!sig) {
            res.status(401).json({ error: "Missing signature" });
            return;
          }

          const expected =
            "sha256=" +
            crypto
              .createHmac("sha256", config.githubWebhookSecret)
              .update(JSON.stringify(req.body))
              .digest("hex");

          if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
            res.status(401).json({ error: "Invalid signature" });
            return;
          }
        }

        const event = req.headers["x-github-event"];
        if (event !== "push") {
          res.json({ message: `Ignored event: ${event}` });
          return;
        }

        const { changed, removed } = parseGitHubPushPayload(req.body);

        if (changed.length === 0 && removed.length === 0) {
          res.json({ message: "No .md files changed" });
          return;
        }

        // Process async — respond immediately
        res.json({ message: "Processing", changed: changed.length, removed: removed.length });

        try {
          await incrementalSync(changed, removed);
        } catch (err) {
          console.error("[webhook] Sync failed:", err);
        }
      }
    );
  }

  // --- Manual full sync ---
  app.post("/sync", requireApiKey, async (_req, res) => {
    try {
      const result = await fullSync();
      res.json({ message: "Sync complete", ...result });
    } catch (err) {
      console.error("[sync] Failed:", err);
      res.status(500).json({ error: "Sync failed", message: String(err) });
    }
  });

  // --- REST API (for Custom GPTs and other HTTP clients) ---
  const apiRouter = express.Router();
  apiRouter.use(express.json());
  apiRouter.use(requireApiKey);

  apiRouter.post("/search", async (req, res) => {
    try {
      const { query, limit = 5, filter_tags, filter_folder } = req.body;
      if (!query) { res.status(400).json({ error: "query is required" }); return; }
      const embedding = await generateQueryEmbedding(query);
      const results = await searchNotes({ embedding, limit, filterTags: filter_tags, filterFolder: filter_folder });
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  apiRouter.get("/notes/*path", async (req, res) => {
    try {
      const notePath = Array.isArray(req.params.path) ? req.params.path.join("/") : req.params.path;
      const note = await getNote(notePath);
      if (!note) { res.status(404).json({ error: "Note not found" }); return; }
      res.json(note);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  apiRouter.get("/notes", async (req, res) => {
    try {
      const { folder, tags, updated_after, limit } = req.query;
      const results = await listNotes({
        folder: folder as string | undefined,
        tags: tags ? (tags as string).split(",") : undefined,
        updatedAfter: updated_after as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  apiRouter.post("/notes", async (req, res) => {
    try {
      const { path, content } = req.body;
      if (!path || !content) { res.status(400).json({ error: "path and content are required" }); return; }
      await vault.write(path, content, `Add note: ${path}`);
      res.json({ message: `Note written: ${path}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  apiRouter.patch("/notes", async (req, res) => {
    try {
      const { path, old_text, new_text } = req.body;
      if (!path || !old_text || new_text === undefined) {
        res.status(400).json({ error: "path, old_text, and new_text are required" }); return;
      }
      const raw = await vault.read(path);
      if (!raw.includes(old_text)) { res.status(400).json({ error: "old_text not found in note" }); return; }
      await vault.write(path, raw.replace(old_text, new_text), `Update note: ${path}`);
      res.json({ message: `Note updated: ${path}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  apiRouter.delete("/notes/*path", async (req, res) => {
    try {
      const notePath = Array.isArray(req.params.path) ? req.params.path.join("/") : req.params.path;
      await vault.delete(notePath, `Delete note: ${notePath}`);
      res.json({ message: `Note deleted: ${notePath}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.use("/api", apiRouter);

  // --- OpenAPI spec for Custom GPTs ---
  app.get("/openapi.json", (_req, res) => {
    res.json({
      openapi: "3.1.0",
      info: { title: "MegaBrain", version: "1.0.0", description: "Obsidian vault semantic memory API" },
      servers: [{ url: config.publicUrl }],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" }
        }
      },
      security: [{ ApiKeyAuth: [] }],
      paths: {
        "/api/search": {
          post: {
            operationId: "searchBrain",
            summary: "Semantic search across vault notes",
            requestBody: {
              required: true,
              content: { "application/json": { schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: { type: "string", description: "What to search for" },
                  limit: { type: "integer", default: 5 },
                  filter_tags: { type: "array", items: { type: "string" } },
                  filter_folder: { type: "string" },
                }
              }}}
            },
            responses: { "200": { description: "Search results" } }
          }
        },
        "/api/notes": {
          get: {
            operationId: "listNotes",
            summary: "List notes with optional filters",
            parameters: [
              { name: "folder", in: "query", schema: { type: "string" } },
              { name: "tags", in: "query", schema: { type: "string" }, description: "Comma-separated" },
              { name: "updated_after", in: "query", schema: { type: "string" } },
              { name: "limit", in: "query", schema: { type: "integer" } },
            ],
            responses: { "200": { description: "List of notes" } }
          },
          post: {
            operationId: "addNote",
            summary: "Create a note in the vault",
            requestBody: {
              required: true,
              content: { "application/json": { schema: {
                type: "object", required: ["path", "content"],
                properties: { path: { type: "string" }, content: { type: "string" } }
              }}}
            },
            responses: { "200": { description: "Note created" } }
          },
          patch: {
            operationId: "updateNote",
            summary: "Update part of an existing note",
            requestBody: {
              required: true,
              content: { "application/json": { schema: {
                type: "object", required: ["path", "old_text", "new_text"],
                properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } }
              }}}
            },
            responses: { "200": { description: "Note updated" } }
          }
        },
        "/api/notes/{path}": {
          get: {
            operationId: "getNote",
            summary: "Get full content of a note",
            parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Note content" } }
          },
          delete: {
            operationId: "deleteNote",
            summary: "Delete a note",
            parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Note deleted" } }
          }
        }
      }
    });
  });

  // --- MCP over SSE ---
  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", requireApiKey, async (req, res) => {
    // Prevent CDN/proxy buffering of SSE stream
    res.setHeader("X-Accel-Buffering", "no");
    const keyParam = req.query.key ? `?key=${req.query.key}` : "";
    const transport = new SSEServerTransport(`/mcp/messages${keyParam}`, res);
    transports.set(transport.sessionId, transport);

    res.on("close", () => {
      transports.delete(transport.sessionId);
    });

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
  });

  // --- MCP Streamable HTTP (new transport — Postman, OpenAI, etc.) ---
  const httpTransports = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", requireApiKey, express.json(), async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      // New session (initialize) or existing session
      let transport = sessionId ? httpTransports.get(sessionId) : undefined;

      if (!transport) {
        // New session — sessionId is set inside handleRequest, so store after
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        transport.onclose = () => { if (transport!.sessionId) httpTransports.delete(transport!.sessionId); };
        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        if (transport.sessionId) httpTransports.set(transport.sessionId, transport);
      } else {
        await transport.handleRequest(req, res, req.body);
      }
    } else if (req.method === "GET") {
      // SSE stream for resuming
      const transport = sessionId ? httpTransports.get(sessionId) : undefined;
      if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
      res.setHeader("X-Accel-Buffering", "no");
      await transport.handleRequest(req, res);
    } else if (req.method === "DELETE") {
      const transport = sessionId ? httpTransports.get(sessionId) : undefined;
      if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
      await transport.handleRequest(req, res);
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  });

  app.post("/mcp/messages", requireApiKey, express.json(), async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(400).json({ error: "Unknown session" });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  return app;
}

// --- Cron: full sync every 10 minutes as fallback ---
export function startCronSync(intervalMs = 10 * 60 * 1000) {
  console.log(`[cron] Backup sync every ${intervalMs / 1000}s`);

  const run = async () => {
    try {
      await fullSync();
    } catch (err) {
      console.error("[cron] Sync failed:", err);
    }
  };

  setInterval(run, intervalMs);
}
