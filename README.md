# MegaBrain — Company Brain

> ⚠️ **Heads-up: the multi-user `company` edition is not fully tested yet.** It works, but it hasn't had thorough testing — especially the per-user auth and write attribution. Run it with that in mind. For the battle-tested single-user setup, use the [`main`](../../tree/main) branch.

Shared semantic memory for your team. Anyone can search, read, and write notes by meaning — and every write is attributed to the person who made it.

```
Shared vault (GitHub) → Sync Worker → Neon (pgvector) → MCP Server → Team's agents
```

> This is the `company` branch — multi-user edition. For the single-user personal brain, see `main`.

## How it works

1. Anyone on the team pushes Markdown notes to a shared private GitHub repo
2. GitHub webhooks trigger the sync worker, which generates embeddings (OpenAI `text-embedding-3-small`) and stores them in Neon PostgreSQL + pgvector
3. An MCP server exposes semantic search and CRUD tools to any MCP-compatible client
4. Every write records who made it in the GitHub commit (`[bob] Add note: ...`)

Everything runs as a single Node.js service on Railway (~$5/mo).

## Setup

### 1. Create the shared vault repo

Create a private GitHub repo (e.g. `your-org/company-vault`). This is where all team notes live as `.md` files.

### 2. Deploy to Railway

```bash
railway login
railway init
railway up --branch company
```

Set these env vars in the Railway dashboard:

```
NEON_DATABASE_URL=...
OPENAI_API_KEY=...
GITHUB_TOKEN=...
GITHUB_REPO=your-org/company-vault
GITHUB_WEBHOOK_SECRET=...
API_KEYS=andrea:key1,bob:key2,carlos:key3
PUBLIC_URL=https://your-app.railway.app
```

### 3. Generate keys for each teammate

```bash
npx tsx src/cli.ts gen-key andrea
npx tsx src/cli.ts gen-key bob
npx tsx src/cli.ts gen-key carlos
```

Copy the output into `API_KEYS` in Railway (comma-separated).

### 4. Configure the GitHub webhook

In your vault repo settings → Webhooks → Add webhook:
- URL: `https://your-app.railway.app/webhook/github`
- Content type: `application/json`
- Secret: same value as `GITHUB_WEBHOOK_SECRET`
- Events: just `push`

### 5. Connect each teammate to Claude

Each person adds this to their `~/.claude/settings.json` with their own key:

```json
{
  "mcpServers": {
    "company-brain": {
      "type": "sse",
      "url": "https://your-app.railway.app/mcp/sse",
      "headers": {
        "x-api-key": "their-personal-key"
      }
    }
  }
}
```

## MCP Tools

| Tool | Description |
|---|---|
| `search_brain(query)` | Semantic search — finds notes by meaning |
| `get_note(path)` | Read a note's full content |
| `list_notes(folder?, tags?)` | List and filter notes |
| `add_note(path, content)` | Create a new note (attributed to caller) |
| `update_note(path, old_text, new_text)` | Edit part of a note (attributed to caller) |
| `delete_note(path)` | Remove a note (attributed to caller) |

## Connect to ChatGPT / Postman

Use the **Streamable HTTP** transport:

```
https://your-app.railway.app/mcp?key=your-personal-key
```

## API Authentication

All endpoints except `/health` and `/webhook/github` require a personal API key.

Accepted formats:
- Header: `x-api-key: your-key`
- Header: `Authorization: Bearer your-key`
- Query param: `?key=your-key` (for MCP Streamable HTTP)

Keys are configured in Railway via `API_KEYS=name:key,name:key,...`. Each person gets their own key — writes to the vault are committed under their name.

## Manual commands

```bash
npm run dev                          # Run locally
npm run sync                         # Full re-index of all notes
npx tsx src/cli.ts gen-key <name>    # Generate a new API key for a teammate
```

## API Endpoints

| Route | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/webhook/github` | POST | Receives push events, triggers incremental sync |
| `/sync` | POST | Manual full sync |
| `/mcp/sse` | GET | MCP server (SSE transport) |
| `/mcp` | POST/GET | MCP server (Streamable HTTP transport) |
