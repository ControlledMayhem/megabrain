#!/bin/bash
# setup.sh — Guided setup for the GitHub-backed MegaBrain (VAULT_SOURCE=github).
#
# This wires the GitHub-driver path end to end: a private GitHub vault repo, a
# local→GitHub auto-push LaunchAgent, a Neon database, a Railway deploy, and a
# push webhook for instant sync.
#
# Running a LOCAL Markdown folder instead? You do NOT need this script — follow
# the "Quick start (local vault)" section in the README (~3 commands).
#
# Run: ./scripts/setup.sh
#
# Prerequisites:
#   - Node.js 20+
#   - git
#   - gh CLI (GitHub CLI) — https://cli.github.com
#   - neon CLI — npm install -g neonctl
#   - railway CLI — npm install -g @railway/cli

set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

step=0
total_steps=10

header() {
  step=$((step + 1))
  echo ""
  echo -e "${CYAN}${BOLD}[$step/$total_steps] $1${RESET}"
  echo -e "${DIM}────────────────────────────────────────${RESET}"
}

success() { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}!${RESET} $1"; }
fail()    { echo -e "  ${RED}✗${RESET} $1"; }
ask()     { echo -ne "  ${BOLD}$1${RESET} "; }

echo ""
echo -e "${BOLD}🧠 MegaBrain Setup${RESET}"
echo -e "${DIM}Obsidian Semantic Memory System${RESET}"
echo ""
echo -e "${YELLOW}${BOLD}This sets up the GitHub-backed vault driver${RESET} (VAULT_SOURCE=github):"
echo -e "${DIM}  private GitHub vault repo · local→GitHub auto-push · Neon · Railway · webhook.${RESET}"
echo ""
echo -e "  ${BOLD}Just want a local Markdown folder?${RESET} You don't need this script —"
echo -e "  follow ${BOLD}Quick start (local vault)${RESET} in the README (~3 commands)."
echo ""
ask "Continue with the GitHub-backed setup? (y/n):"
read -r proceed
if [ "$proceed" != "y" ] && [ "$proceed" != "Y" ]; then
  echo -e "  ${DIM}Aborted. See the README's local-folder quickstart instead.${RESET}"
  exit 0
fi

# ─── Check prerequisites ───────────────────────────────────────

header "Checking prerequisites"

missing=0
for cmd in node git gh npx; do
  if command -v "$cmd" &>/dev/null; then
    success "$cmd found: $(command -v "$cmd")"
  else
    fail "$cmd not found — install it first"
    missing=1
  fi
done

if [ "$missing" -eq 1 ]; then
  echo ""
  fail "Install missing tools and re-run this script."
  exit 1
fi

node_version=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$node_version" -lt 20 ]; then
  fail "Node.js 20+ required (found v$(node -v))"
  exit 1
fi
success "Node.js version OK ($(node -v))"

# ─── Vault path ────────────────────────────────────────────────

header "Locating Obsidian vault"

VAULT_PATH=""
# Try to auto-detect common Obsidian locations
for candidate in \
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents"/* \
  "$HOME/Documents"/*obsidian* \
  "$HOME/Documents"/*Obsidian* \
  "$HOME/Obsidian"/*; do
  if [ -d "$candidate" ] && [ -d "$candidate/.obsidian" ]; then
    echo -e "  Found vault: ${BOLD}$candidate${RESET}"
    ask "Use this vault? (y/n):"
    read -r use_it
    if [ "$use_it" = "y" ] || [ "$use_it" = "Y" ]; then
      VAULT_PATH="$candidate"
      break
    fi
  fi
done

if [ -z "$VAULT_PATH" ]; then
  ask "Enter the full path to your Obsidian vault:"
  read -r VAULT_PATH
fi

if [ ! -d "$VAULT_PATH" ]; then
  fail "Directory not found: $VAULT_PATH"
  exit 1
fi

if [ ! -d "$VAULT_PATH/.obsidian" ]; then
  warn "No .obsidian folder found — are you sure this is an Obsidian vault?"
  ask "Continue anyway? (y/n):"
  read -r cont
  [ "$cont" != "y" ] && exit 1
fi

success "Vault: $VAULT_PATH"

# ─── GitHub repo for the vault ─────────────────────────────────

header "Creating private GitHub repo for the vault"

ask "GitHub repo name (e.g. megabrain-vault):"
read -r REPO_NAME
REPO_NAME="${REPO_NAME:-megabrain-vault}"

GITHUB_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
if [ -z "$GITHUB_USER" ]; then
  fail "Not logged into GitHub CLI. Run: gh auth login"
  exit 1
fi
success "GitHub user: $GITHUB_USER"

FULL_REPO="$GITHUB_USER/$REPO_NAME"

if gh repo view "$FULL_REPO" &>/dev/null; then
  warn "Repo $FULL_REPO already exists — skipping creation"
else
  gh repo create "$REPO_NAME" --private --description "Obsidian vault — MegaBrain semantic memory"
  success "Created private repo: $FULL_REPO"
fi

# ─── Initialize git in vault ──────────────────────────────────

header "Initializing git in the vault"

cd "$VAULT_PATH"

if [ -d .git ]; then
  warn "Git already initialized in vault — skipping"
else
  git init
  success "Git initialized"
fi

# Create .gitignore
cat > .gitignore << 'GITIGNORE'
# Obsidian internals (keep only what matters)
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.obsidian/graph.json
.obsidian/backlink.json
.trash/
.DS_Store
GITIGNORE

success ".gitignore created"

# Set remote
REMOTE_URL="https://github.com/$FULL_REPO.git"
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REMOTE_URL"
  warn "Remote 'origin' updated to $REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
  success "Remote 'origin' added: $REMOTE_URL"
fi

# Initial commit and push
git add -A
git commit -m "Initial vault sync" --quiet 2>/dev/null || warn "Nothing to commit"
git branch -M main 2>/dev/null || true
git push -u origin main --quiet 2>/dev/null && success "Pushed to GitHub" || warn "Push failed — you may need to push manually"

cd "$PROJECT_DIR"

# ─── Neon database ─────────────────────────────────────────────

header "Setting up Neon database"

NEON_DATABASE_URL=""

if command -v neonctl &>/dev/null; then
  ask "Create a new Neon project? (y/n):"
  read -r create_neon
  if [ "$create_neon" = "y" ]; then
    echo "  Creating Neon project 'megabrain'..."
    neon_output=$(neonctl projects create --name megabrain --output json 2>/dev/null || echo "")
    if [ -n "$neon_output" ]; then
      NEON_DATABASE_URL=$(echo "$neon_output" | node -e "
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        console.log(d.connection_uris?.[0]?.connection_uri || '');
      " 2>/dev/null || echo "")

      if [ -n "$NEON_DATABASE_URL" ]; then
        success "Neon project created"
      fi
    fi
  fi
fi

if [ -z "$NEON_DATABASE_URL" ]; then
  echo ""
  echo -e "  ${DIM}Go to https://console.neon.tech and create a project.${RESET}"
  echo -e "  ${DIM}Copy the connection string (postgresql://...).${RESET}"
  echo ""
  ask "Paste your Neon connection string:"
  read -r NEON_DATABASE_URL
fi

if [ -z "$NEON_DATABASE_URL" ]; then
  fail "No database URL provided"
  exit 1
fi

# Run schema
echo "  Running setup-db.sql..."
psql "$NEON_DATABASE_URL" -f "$SCRIPT_DIR/setup-db.sql" -q 2>/dev/null && success "Schema created" || {
  warn "psql failed — trying with node..."
  node -e "
    const { neon } = require('@neondatabase/serverless');
    const fs = require('fs');
    const sql = neon('$NEON_DATABASE_URL');
    const schema = fs.readFileSync('$SCRIPT_DIR/setup-db.sql', 'utf8');
    // Split by semicolons and run each statement
    const stmts = schema.split(';').map(s => s.trim()).filter(Boolean);
    (async () => {
      for (const stmt of stmts) {
        await sql(stmt);
      }
      console.log('  ✓ Schema created via Node.js');
    })().catch(e => { console.error('  ✗ Failed:', e.message); process.exit(1); });
  " 2>/dev/null || fail "Could not run schema — run scripts/setup-db.sql manually against your Neon DB"
}

# ─── OpenAI API key ───────────────────────────────────────────

header "Configuring API keys"

ask "OpenAI API key (sk-...):"
read -r OPENAI_API_KEY

if [ -z "$OPENAI_API_KEY" ]; then
  fail "OpenAI API key is required for embeddings"
  exit 1
fi

# GitHub token for the sync worker (needs repo read access)
echo ""
echo -e "  ${DIM}Create a fine-grained token at: https://github.com/settings/tokens?type=beta${RESET}"
echo -e "  ${DIM}Scope: Contents (read/write) on repo '$REPO_NAME'${RESET}"
echo ""
ask "GitHub personal access token:"
read -r GITHUB_TOKEN

if [ -z "$GITHUB_TOKEN" ]; then
  fail "GitHub token is required"
  exit 1
fi

# Webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 20)
success "Generated webhook secret"

# API key for MCP/REST auth
API_KEY=$(openssl rand -hex 32)
success "Generated API key"

# ─── Write .env ────────────────────────────────────────────────

header "Writing .env file"

cat > "$PROJECT_DIR/.env" << ENV
NEON_DATABASE_URL=$NEON_DATABASE_URL
OPENAI_API_KEY=$OPENAI_API_KEY
# This guided setup wires the GitHub-backed vault driver.
VAULT_SOURCE=github
GITHUB_TOKEN=$GITHUB_TOKEN
GITHUB_REPO=$FULL_REPO
GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET
API_KEY=$API_KEY
PORT=3000
ENV

success ".env created at $PROJECT_DIR/.env"

# ─── Install dependencies ─────────────────────────────────────

header "Installing dependencies & building"

cd "$PROJECT_DIR"
npm install --silent
success "Dependencies installed"

npx tsc --noEmit && success "TypeScript compiles OK" || warn "Type errors found"

# ─── Configure vault sync LaunchAgent ──────────────────────────

header "Setting up vault auto-sync"

PLIST_NAME="megabrain.vault-sync.plist"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Update the plist with the actual vault path
sed "s|/path/to/your/ObsidianVault|$VAULT_PATH|g" \
  "$PLIST_SRC" > "$PLIST_DST"

# Also update the script path in the plist
sed -i '' "s|/path/to/megabrain|$PROJECT_DIR|g" "$PLIST_DST"

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST" 2>/dev/null && success "LaunchAgent installed and running" || warn "LaunchAgent load failed — start manually with: bash $SCRIPT_DIR/mac-sync.sh"

# ─── Deploy to Railway ─────────────────────────────────────────

header "Deploying to Railway"

if command -v railway &>/dev/null; then
  if railway whoami &>/dev/null 2>&1; then
    success "Railway CLI authenticated"

    ask "Deploy to Railway now? (y/n):"
    read -r do_deploy
    if [ "$do_deploy" = "y" ]; then
      # Init project if needed
      railway init 2>/dev/null || true

      # Set env vars (quoted to handle special chars)
      while IFS='=' read -r key value; do
        [ -z "$key" ] && continue
        railway variables set "$key=$value" 2>/dev/null
      done < "$PROJECT_DIR/.env"
      success "Environment variables set"

      # Deploy
      railway up --detach 2>/dev/null && success "Deploy started" || warn "Deploy failed — try manually: railway up"

      echo ""
      echo -e "  ${DIM}Waiting for Railway to assign a domain...${RESET}"
      echo -e "  ${DIM}If no domain yet, run: railway domain${RESET}"
      echo ""
      ask "Enter your Railway public URL (e.g. megabrain-production-xxxx.up.railway.app):"
      read -r RAILWAY_URL
      RAILWAY_URL="${RAILWAY_URL#https://}"
      RAILWAY_URL="${RAILWAY_URL%/}"
    fi
  else
    warn "Not logged into Railway. Run: railway login"
  fi
else
  warn "Railway CLI not found. Install: npm install -g @railway/cli"
fi

if [ -z "$RAILWAY_URL" ]; then
  ask "Enter your Railway public URL (or leave blank to skip):"
  read -r RAILWAY_URL
  RAILWAY_URL="${RAILWAY_URL#https://}"
  RAILWAY_URL="${RAILWAY_URL%/}"
fi

# ─── Configure GitHub webhook ────────────────────────────────

header "Configuring GitHub webhook"

if [ -n "$RAILWAY_URL" ]; then
  WEBHOOK_URL="https://$RAILWAY_URL/webhook/github"

  # Check if webhook already exists
  existing_hook=$(gh api "repos/$FULL_REPO/hooks" --jq '.[].config.url' 2>/dev/null | grep "$RAILWAY_URL" || echo "")

  if [ -n "$existing_hook" ]; then
    warn "Webhook already exists for $RAILWAY_URL — skipping"
  else
    gh api "repos/$FULL_REPO/hooks" \
      --method POST \
      --field "name=web" \
      --field "active=true" \
      --field "events[]=push" \
      --field "config[url]=$WEBHOOK_URL" \
      --field "config[content_type]=json" \
      --field "config[secret]=$WEBHOOK_SECRET" \
      --silent 2>/dev/null \
      && success "Webhook configured: $WEBHOOK_URL" \
      || warn "Could not create webhook — add it manually in repo Settings → Webhooks"
  fi
else
  warn "No Railway URL — skipping webhook setup"
  echo -e "  ${DIM}Add manually later: repo Settings → Webhooks → $WEBHOOK_URL${RESET}"
fi

# ─── Configure Claude Code MCP ───────────────────────────────

header "Configuring Claude Code MCP"

if [ -n "$RAILWAY_URL" ]; then
  MCP_SSE_URL="https://$RAILWAY_URL/mcp/sse"
  MCP_HTTP_URL="https://$RAILWAY_URL/mcp?key=$API_KEY"
  CLAUDE_SETTINGS="$HOME/.claude/settings.json"

  mkdir -p "$HOME/.claude"

  if [ -f "$CLAUDE_SETTINGS" ]; then
    if grep -q "megabrain" "$CLAUDE_SETTINGS" 2>/dev/null; then
      warn "MCP 'megabrain' already in Claude settings — skipping"
    else
      node -e "
        const fs = require('fs');
        const settings = JSON.parse(fs.readFileSync('$CLAUDE_SETTINGS', 'utf8'));
        if (!settings.mcpServers) settings.mcpServers = {};
        settings.mcpServers.megabrain = {
          url: '$MCP_SSE_URL',
          headers: { 'x-api-key': '$API_KEY' }
        };
        fs.writeFileSync('$CLAUDE_SETTINGS', JSON.stringify(settings, null, 2));
      " 2>/dev/null && success "MCP added to Claude Code settings" || warn "Could not update settings — add manually"
    fi
  else
    cat > "$CLAUDE_SETTINGS" << MCPJSON
{
  "mcpServers": {
    "megabrain": {
      "url": "$MCP_SSE_URL",
      "headers": {
        "x-api-key": "$API_KEY"
      }
    }
  }
}
MCPJSON
    success "Created Claude Code settings with MCP config"
  fi

  echo -e "  ${DIM}Claude Code MCP (SSE): $MCP_SSE_URL${RESET}"
  echo -e "  ${DIM}OpenAI/Postman MCP (HTTP): $MCP_HTTP_URL${RESET}"
else
  warn "No Railway URL — skipping MCP config"
fi

# ─── Summary ──────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}━━━ Setup complete! ━━━${RESET}"
echo ""
echo -e "  Vault:     ${BOLD}$VAULT_PATH${RESET}"
echo -e "  GitHub:    ${BOLD}$FULL_REPO${RESET} (private)"
echo -e "  Database:  ${BOLD}Neon PostgreSQL${RESET}"
echo -e "  Sync:      ${BOLD}LaunchAgent running${RESET}"
if [ -n "$RAILWAY_URL" ]; then
echo -e "  Server:    ${BOLD}https://$RAILWAY_URL${RESET}"
echo -e "  Webhook:   ${BOLD}https://$RAILWAY_URL/webhook/github${RESET}"
echo -e "  MCP (Claude Code): ${BOLD}https://$RAILWAY_URL/mcp/sse${RESET}"
echo -e "  MCP (OpenAI/HTTP): ${BOLD}https://$RAILWAY_URL/mcp?key=$API_KEY${RESET}"
echo -e "  API Key:   ${BOLD}$API_KEY${RESET}"
fi
echo ""
echo -e "${BOLD}Test it:${RESET}"
echo ""
if [ -n "$RAILWAY_URL" ]; then
echo -e "  curl https://$RAILWAY_URL/health"
echo -e "  curl -X POST -H \"x-api-key: $API_KEY\" https://$RAILWAY_URL/sync  # index all notes"
else
echo -e "  cd $PROJECT_DIR && npm run dev"
echo -e "  curl http://localhost:3000/health"
echo -e "  curl -X POST http://localhost:3000/sync"
fi
echo ""
