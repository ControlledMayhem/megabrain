# MegaBrain

You take notes in Markdown (Obsidian, or any editor). Your AI agents can't read them. MegaBrain fixes that: it gives Claude, ChatGPT, or any MCP-compatible client semantic access to your vault, so they find notes by meaning, not keywords. Self-hosted — run it entirely on your own box, or on a ~$5/mo PaaS. Your data stays yours.

Semantic memory system for a Markdown vault. Your AI agents (Claude, ChatGPT, or any MCP-compatible client) can search, read, and write notes by meaning — not just keywords.

```
  Markdown vault (a folder on disk)
          │
          │  kept current however you like:
          │  edit in place · Syncthing · rsync/SSH · Gitea/Forgejo · GitHub
          ▼
   Sync worker  ──►  Postgres + pgvector  ──►  MCP server  ──►  Agents
                                                                (Claude, ChatGPT, …)
```

MegaBrain reads **a folder of Markdown** and indexes it into Postgres + pgvector. How that folder stays in sync across your devices is entirely your choice — git/GitHub is just one option among several (see [Sync options](#sync-options)).

## How it works

1. You point MegaBrain at a local folder of Markdown and a Postgres/pgvector connection string.
2. The sync worker reads the folder, generates embeddings (OpenAI `text-embedding-3-small`), and stores them in Postgres + pgvector. A full re-index runs on demand (`npm run sync`) and on a 10-minute cron.
3. An MCP server exposes semantic search and CRUD tools to any MCP-compatible client.

Everything runs as a single Node.js process — on your own VPS, or on a PaaS like Railway (~$5/mo).

## Quick start (local vault — the happy path)

No GitHub account, no git, no webhooks required.

```bash
# 1. A Postgres database with the pgvector extension.
#    Any instance works — self-hosted, Neon, or Supabase.
psql "$YOUR_DATABASE_URL" -f scripts/setup-db.sql

# 2. Configure
cp .env.example .env
#    Set in .env:
#      NEON_DATABASE_URL   → your Postgres/pgvector connection string
#      OPENAI_API_KEY      → for embeddings
#      MEGABRAIN_VAULT_PATH → absolute path to your Markdown folder
#    Leave VAULT_SOURCE=local (the default).

# 3. Install, index, run
npm install
npm run sync     # index every .md file in your vault folder
npm run dev      # start the MCP + REST server (http://localhost:3000)
```

That's it — `search_brain`, `get_note`, and friends now work against your local folder. New edits get picked up by the 10-minute cron, or run `npm run sync` to re-index immediately.

**Prerequisites:** Node.js 20+, and a Postgres database with `pgvector`.

## Sync options

MegaBrain only needs the vault folder to be reasonably current — it doesn't care *how* it got that way. Pick whatever fits your setup; they're interchangeable:

| Option | How | Good for |
|---|---|---|
| **Edit in place** | Run MegaBrain on the same machine you take notes on. | Single machine, simplest. |
| **Syncthing** | Sync the vault folder peer-to-peer across devices onto the box running MegaBrain. | Multi-device, no cloud, no git. |
| **rsync / SSH** | `rsync` or an `ssh`+cron job pushes the folder to the server. | VPS deployments. |
| **Gitea / Forgejo** | Self-hosted git; a cron `git pull` keeps the server's folder current. | You want git history, fully self-hosted. |
| **GitHub** | Built-in `github` driver reads the repo directly via the API, with optional push-webhook for instant sync. | You already live in GitHub / want zero-infra hosting. |

The first four all use the **default `local` driver** — they just keep a folder fresh on disk. GitHub is the one option with a dedicated driver (see below), because it reads over the API rather than from disk.

### Using the GitHub driver (optional)

If you'd rather keep the vault in a GitHub repo and have MegaBrain read it over the API:

```bash
# in .env
VAULT_SOURCE=github
GITHUB_TOKEN=github_pat_...        # fine-grained, Contents read/write on the repo
GITHUB_REPO=your-username/your-vault-repo
GITHUB_WEBHOOK_SECRET=...          # optional, for push-driven incremental sync
```

With `VAULT_SOURCE=github`, MegaBrain exposes a `/webhook/github` endpoint so a push triggers an incremental sync. The `scripts/setup.sh` helper automates this whole path (create repo, Neon DB, Railway deploy, webhook) — see [Hosted quickstart](#hosted-quickstart-github--neon--railway). `GITHUB_*` vars are required **only** when this driver is selected; in the default local mode the app starts with no GitHub config at all.

## MCP Tools

| Tool | Description |
|---|---|
| `search_brain(query)` | Semantic search — finds notes by meaning |
| `get_note(path)` | Read a note's full content |
| `list_notes(folder?, tags?)` | List and filter notes |
| `add_note(path, content)` | Create a new note |
| `update_note(path, old_text, new_text)` | Edit part of a note |
| `delete_note(path)` | Remove a note |

Writes go to whichever vault source is configured: the `local` driver writes the file directly to disk; the `github` driver commits it to the repo.

## Connect to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "megabrain": {
      "type": "sse",
      "url": "https://your-server.example.com/mcp/sse",
      "headers": {
        "x-api-key": "your-api-key"
      }
    }
  }
}
```

Then Claude can do things like:

```
> Search my brain for notes about project architecture decisions
> What notes do I have tagged "ideas"?
> Update my preferences — I prefer mango ice cream now, not strawberry
```

## Connect to ChatGPT / Postman

Use the **Streamable HTTP** transport (newer MCP spec):

```
https://your-server.example.com/mcp?key=your-api-key
```

No auth header needed — the key goes in the URL query param. In ChatGPT's MCP connector, set **Authentication: None** and use the URL above.

## API Authentication

All endpoints except `/health` (and `/webhook/github`, when the github driver is active) require an API key.

Accepted formats:
- Header: `x-api-key: your-key`
- Header: `Authorization: Bearer your-key`
- Query param: `?key=your-key` (for MCP Streamable HTTP)

If `API_KEY` is unset, auth is disabled — fine for localhost, not for a public server.

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
| `/webhook/github` | POST | (github driver only) Receives push events, triggers incremental sync |
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
curl -X POST https://your-server.example.com/api/search \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{"query": "architecture decisions", "limit": 5}'
```

**Custom GPT:** in the GPT builder, add an Action and import the schema from `https://your-server.example.com/openapi.json`, then set API Key auth (`x-api-key`).

## Deploy

MegaBrain is a single Node.js process — host it anywhere that runs Node 20+.

**Self-hosted (VPS):** clone the repo, set up `.env` (local driver pointed at a folder you keep synced — see [Sync options](#sync-options)), and run `npm run build && npm start` behind a process manager (systemd, pm2) and a reverse proxy.

**Railway / Fly / Render:** push the repo, set the env vars from `.env.example` in the dashboard, and deploy. For the github driver, also configure the GitHub webhook to point at `https://your-app.example.com/webhook/github`.

### Hosted quickstart (GitHub + Neon + Railway)

```bash
./scripts/setup.sh
```

The guided script wires the **GitHub-backed** path end to end: it creates a private GitHub repo for your vault, a Neon database, API keys, a macOS LaunchAgent that auto-pushes your local Obsidian vault to the repo, a Railway deploy, and the push webhook. It sets `VAULT_SOURCE=github` for you. Optional CLIs it can use: [Neon CLI](https://neon.tech/docs/reference/cli-install) and [Railway CLI](https://docs.railway.app/guides/cli); it also expects the [GitHub CLI](https://cli.github.com) (`gh auth login`).

## Troubleshooting

**Local vault: notes not showing up**
- Confirm `MEGABRAIN_VAULT_PATH` points at the folder (absolute path) and contains `.md` files (dotfiles/dirs like `.obsidian` are skipped).
- Run `npm run sync` to force a re-index; new edits otherwise wait for the 10-minute cron.

**pgvector extension missing**
- Connect to your database and run: `CREATE EXTENSION IF NOT EXISTS vector;`
- Then re-run `scripts/setup-db.sql`.

**(github driver) Webhook not triggering sync**
- Check server logs.
- Verify the webhook is configured in GitHub: repo Settings → Webhooks → Recent Deliveries.
- Confirm `GITHUB_WEBHOOK_SECRET` matches the one in your GitHub webhook config.

**(github driver) Sync fails with authentication error**
- Regenerate the GitHub token: it needs `Contents: read/write` on your vault repo.

**MCP not connecting in Claude Code**
- Check the app is running: `curl https://your-server.example.com/health`
- Verify the `url` in `~/.claude/settings.json` ends in `/mcp/sse`.
- Confirm the `x-api-key` header matches `API_KEY`.

## Architecture decisions (v1)

- **Pluggable vault source** — the indexer/MCP/REST layers talk to a `VaultSource` interface; `local` (a folder on disk) is the default driver, `github` is opt-in. The embeddings + Postgres layers are source-agnostic.
- **Single service** — sync worker + MCP server in one process. Split later if needed.
- **Embed title + tags + content** — concatenated for better semantic recall.
- **Current version only** — semantic search sees the latest version of each note; embeddings are not versioned.
- **Direct write for `add_note`** — single-user system, no PR workflow needed.

## Team / multi-user setup

Want a shared brain for a whole team instead of just yourself? The [`company`](https://github.com/ControlledMayhem/megabrain/tree/company) branch is a multi-user edition: per-user API keys, with every write attributed to the person who made it (`[bob] Add note: ...`).

## License

MIT — see [LICENSE](./LICENSE)
