# MegaBrain

You take notes in Obsidian. Your AI agents can't read them. MegaBrain fixes that: it gives Claude, ChatGPT, or any MCP-compatible client semantic access to your vault, so they find notes by meaning, not keywords. Self-hosted, ~$5/mo, your data stays yours.

Semantic memory system for Obsidian. Your AI agents (Claude, ChatGPT, or any MCP-compatible client) can search, read, and write notes by meaning — not just keywords.

```
Obsidian vault → GitHub → Sync Worker → Neon (pgvector) → MCP Server → Agents
```

## How it works

1. A LaunchAgent auto-pushes your Obsidian vault to a private GitHub repo
2. GitHub webhooks trigger the sync worker, which generates embeddings (OpenAI `text-embedding-3-small`) and stores them in Neon PostgreSQL + pgvector
3. An MCP server exposes semantic search and CRUD tools to any MCP-compatible client

Everything runs as a single Node.js service on Railway (~$5/mo).

## Quick setup

```bash
./scripts/setup.sh
```

The script walks you through everything: GitHub repo, Neon database, API keys, vault sync, and local config.

**Prerequisites:**
- Node.js 20+
- git
- [GitHub CLI](https://cli.github.com) — run `gh auth login` before setup
- [Neon CLI](https://neon.tech/docs/reference/cli-install) *(optional)* — `npm install -g neonctl` — auto-creates your Neon project
- [Railway CLI](https://docs.railway.app/guides/cli) *(optional)* — `npm install -g @railway/cli` — automated Railway deploy

**Accounts needed:**
- [Neon](https://neon.tech) — free tier works (~$0/mo for personal use)
- [OpenAI](https://platform.openai.com) — embeddings via `text-embedding-3-small` (~$0.02/1M tokens, negligible for personal vaults)
- [Railway](https://railway.app) — ~$5/mo Hobby plan for always-on server

## MCP Tools

| Tool | Description |
|---|---|
| `search_brain(query)` | Semantic search — finds notes by meaning |
| `get_note(path)` | Read a note's full content |
| `list_notes(folder?, tags?)` | List and filter notes |
| `add_note(path, content)` | Create a new note |
| `update_note(path, old_text, new_text)` | Edit part of a note |
| `delete_note(path)` | Remove a note |

## Connect to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "megabrain": {
      "type": "sse",
      "url": "https://your-app.railway.app/mcp/sse",
      "headers": {
        "x-api-key": "your-api-key"
      }
    }
  }
}
```

The `setup.sh` script does this automatically. The API key is generated during setup and stored in Railway env vars.

Then Claude can do things like:

```
> Search my brain for notes about project architecture decisions
> What notes do I have tagged "ideas"?
> Update my preferences — I prefer mango ice cream now, not strawberry
```

## Connect to ChatGPT / Postman

Use the **Streamable HTTP** transport (newer MCP spec):

```
https://your-app.railway.app/mcp?key=your-api-key
```

No auth header needed — the key goes in the URL query param. In ChatGPT's MCP connector, set **Authentication: None** and use the URL above.

## API Authentication

All endpoints except `/health` and `/webhook/github` require an API key.

Accepted formats:
- Header: `x-api-key: your-key`
- Header: `Authorization: Bearer your-key`
- Query param: `?key=your-key` (for MCP Streamable HTTP)

## Manual commands

```bash
npm run dev          # Run locally with hot reload
npm run build        # Compile TypeScript
npm start            # Run compiled version
npm run sync         # Full re-index of all notes
npm run reindex      # Same as sync
```

## API Endpoints

| Route | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/webhook/github` | POST | Receives push events, triggers incremental sync |
| `/sync` | POST | Manual full sync |
| `/mcp/sse` | GET | MCP server (SSE transport) |
| `/mcp` | GET/POST/DELETE | MCP server (Streamable HTTP transport) |
| `/api/*` | GET/POST/PATCH/DELETE | REST API (see below) |
| `/openapi.json` | GET | OpenAPI 3.1 spec — point a Custom GPT here |

## REST API

For clients that don't speak MCP — Custom GPTs, scripts, or any HTTP caller — the same vault operations are exposed as a plain REST API under `/api`. All routes require an API key (`x-api-key` header, `Authorization: Bearer`, or `?key=`).

| Route | Method | Description |
|---|---|---|
| `/api/search` | POST | Semantic search. Body: `{ query, limit?, filter_tags?, filter_folder? }` |
| `/api/notes` | GET | List notes. Query: `folder`, `tags` (comma-separated), `updated_after`, `limit` |
| `/api/notes` | POST | Create a note. Body: `{ path, content }` |
| `/api/notes` | PATCH | Edit part of a note. Body: `{ path, old_text, new_text }` |
| `/api/notes/{path}` | GET | Read a note's full content |
| `/api/notes/{path}` | DELETE | Delete a note |

```bash
curl -X POST https://your-app.railway.app/api/search \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{"query": "architecture decisions", "limit": 5}'
```

**Custom GPT:** in the GPT builder, add an Action and import the schema from `https://your-app.railway.app/openapi.json`, then set API Key auth (`x-api-key`).

## Deploy to Railway

```bash
railway login
railway init
railway up
```

Set your env vars in the Railway dashboard (see `.env.example`), then configure the GitHub webhook pointing to `https://your-app.railway.app/webhook/github`.

## Troubleshooting

**Webhook not triggering sync**
- Check Railway logs: `railway logs`
- Verify webhook is configured in GitHub: repo Settings → Webhooks → Recent Deliveries
- Confirm `GITHUB_WEBHOOK_SECRET` in Railway matches the one in your GitHub webhook config

**Sync fails with authentication error**
- Regenerate GitHub token: it needs `Contents: read/write` permission on your vault repo
- Update in Railway: `railway variables set GITHUB_TOKEN=github_pat_...`

**MCP not connecting in Claude Code**
- Check the app is running: `curl https://your-app.railway.app/health`
- Verify the `url` in `~/.claude/settings.json` ends in `/mcp/sse`
- Confirm the `x-api-key` header matches `API_KEY` in Railway

**iCloud sync conflicts**
- The LaunchAgent runs `git pull --rebase` before each push to handle iCloud-synced changes
- If you see repeated conflicts, run `git reset --hard origin/main` inside your vault directory

**pgvector extension missing**
- Connect to your Neon DB and run: `CREATE EXTENSION IF NOT EXISTS vector;`
- Then re-run `scripts/setup-db.sql`

## Architecture decisions (v1)

- **Single service** — sync worker + MCP server in one process. Split later if needed.
- **Embed title + tags + content** — concatenated for better semantic recall.
- **Current version only** — semantic search sees the latest version of each note; Git keeps the full edit history, but embeddings are not versioned.
- **Direct push for `add_note`** — single-user system, no PR workflow needed.

## Team / multi-user setup

Want a shared brain for a whole team instead of just yourself? The [`company`](https://github.com/ControlledMayhem/megabrain/tree/company) branch is a multi-user edition: per-user API keys, with every write attributed to the person who made it (`[bob] Add note: ...`).

## License

MIT — see [LICENSE](./LICENSE)
