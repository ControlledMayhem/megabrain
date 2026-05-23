#!/bin/bash
# mac-sync.sh — Auto-push Obsidian vault changes to GitHub
# Install as LaunchAgent for automatic sync (see megabrain.vault-sync.plist)
#
# Usage: VAULT_PATH=/path/to/vault ./mac-sync.sh

set -euo pipefail

VAULT_PATH="${VAULT_PATH:?Set VAULT_PATH to your Obsidian vault directory}"
INTERVAL="${SYNC_INTERVAL:-300}"  # default: every 5 minutes

cd "$VAULT_PATH"

sync_once() {
  # Skip if no git repo
  if [ ! -d .git ]; then
    echo "[megabrain] No git repo found in $VAULT_PATH — run 'git init' first"
    return 1
  fi

  # Pull first to avoid conflicts (iCloud may have changed files)
  git pull --rebase --quiet 2>/dev/null || true

  # Check for changes
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    return 0  # nothing to sync
  fi

  # Stage, commit, push
  git add -A
  git commit -m "vault sync $(date '+%Y-%m-%d %H:%M:%S')" --quiet
  git push --quiet

  echo "[megabrain] Synced at $(date '+%H:%M:%S')"
}

echo "[megabrain] Watching vault: $VAULT_PATH (every ${INTERVAL}s)"

while true; do
  sync_once || true
  sleep "$INTERVAL"
done
