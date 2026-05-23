# MegaBrain — Claude Code Context

## What this is

Semantic memory system for Obsidian vaults. Markdown notes → embeddings → Neon PostgreSQL + pgvector → MCP Server → AI agents.

## Stack

- **DB**: Neon PostgreSQL + pgvector
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Server**: Node.js + Express + TypeScript → Railway
- **MCP**: `@modelcontextprotocol/sdk` over SSE + Streamable HTTP
- **Vault source**: GitHub (private repo, auto-synced via LaunchAgent on macOS)

## Architecture decisions

| Decision | Choice | Reason |
|---|---|---|
| Sync Worker + MCP Server | Single service | Simpler and cheaper for v1. Split if it scales. |
| What gets embedded | Title + tags + content | Better semantic precision, negligible cost. |
| Version history | Current version only | Git already has full history. |
| `add_note` | Direct push to GitHub | Single-user, no PR workflow needed. |

## Repo structure

```
megabrain/
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # Express (webhooks, health, MCP SSE, cron)
│   ├── mcp.ts            # MCP server tools
│   ├── sync.ts           # Sync logic (full + incremental)
│   ├── db.ts             # Neon queries (upsert, search, list, delete)
│   ├── embeddings.ts     # OpenAI embedding generation
│   ├── github.ts         # GitHub API (list files, read, write, parse webhooks)
│   ├── frontmatter.ts    # YAML frontmatter parser
│   ├── config.ts         # Env validation
│   └── cli.ts            # CLI for sync/reindex
├── scripts/
│   ├── setup-db.sql                    # Neon schema
│   ├── setup.sh                        # Guided setup script
│   ├── mac-sync.sh                     # Vault auto-push script
│   └── megabrain.vault-sync.plist      # macOS LaunchAgent template
├── .env.example
├── package.json
└── tsconfig.json
```

## API endpoints

| Route | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/webhook/github` | POST | Receives push events, triggers incremental sync |
| `/sync` | POST | Manual full sync |
| `/mcp/sse` | GET | MCP server (SSE transport) |
| `/mcp/messages` | POST | MCP message handler |
| `/mcp` | GET/POST/DELETE | Streamable HTTP transport |
| `/api/*` | GET/POST/PATCH/DELETE | REST API (search, list/get/create/update/delete notes) |
| `/openapi.json` | GET | OpenAPI 3.1 spec (Custom GPT actions) |

REST routes (all under `/api`, require API key):
- `POST /api/search` — semantic search
- `GET /api/notes` — list notes (filter by folder, tags, updated_after)
- `GET /api/notes/{path}` — read full note
- `POST /api/notes` — create note
- `PATCH /api/notes` — edit note (old_text → new_text)
- `DELETE /api/notes/{path}` — delete note

## MCP tools

- `search_brain(query, limit?, filter_tags?, filter_folder?)` — semantic search
- `get_note(path)` — full note content
- `list_notes(folder?, tags?, updated_after?, limit?)` — vault discovery
- `add_note(path, content)` — write to vault
- `update_note(path, old_text, new_text)` — edit part of a note
- `delete_note(path)` — remove a note

## Required env vars

```
NEON_DATABASE_URL=
OPENAI_API_KEY=
GITHUB_TOKEN=
GITHUB_REPO=your-username/your-vault-repo
GITHUB_WEBHOOK_SECRET=
API_KEY=
PORT=3000
```

See `.env.example` for setup instructions and `scripts/setup.sh` for guided configuration.
