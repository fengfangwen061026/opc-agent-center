#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTERNAL_DIR="$ROOT_DIR/external"

mkdir -p "$EXTERNAL_DIR"

clone_or_update() {
  local url="$1"
  local dir="$2"
  if [[ -d "$dir/.git" ]]; then
    git -C "$dir" pull --ff-only
  else
    git clone "$url" "$dir"
  fi
  git -C "$dir" log -1 --format='%h %cI %s'
}

echo "== OpenClaw =="
clone_or_update "https://github.com/openclaw/openclaw.git" "$EXTERNAL_DIR/openclaw"
corepack pnpm@10.33.0 --dir "$EXTERNAL_DIR/openclaw" install

echo "== Hermes Agent =="
clone_or_update "https://github.com/NousResearch/hermes-agent.git" "$EXTERNAL_DIR/hermes-agent"
uv venv "$EXTERNAL_DIR/hermes-agent/venv" --python 3.11
uv pip install --python "$EXTERNAL_DIR/hermes-agent/venv/bin/python" -e "$EXTERNAL_DIR/hermes-agent"

echo "== Obsidian Local REST API =="
clone_or_update "https://github.com/coddingtonbear/obsidian-local-rest-api.git" "$EXTERNAL_DIR/obsidian-local-rest-api"
(
  cd "$EXTERNAL_DIR/obsidian-local-rest-api"
  PNPM_WORKSPACE_DIR= pnpm install --ignore-workspace
  # TODO: upstream 3.6.1 build currently omits these direct deps in this environment.
  PNPM_WORKSPACE_DIR= pnpm add body-parser moment @types/body-parser --ignore-workspace
  PNPM_WORKSPACE_DIR= pnpm --ignore-workspace build
)

echo "== Installed CLI probes =="
"$EXTERNAL_DIR/openclaw/openclaw.mjs" --version || true
"$EXTERNAL_DIR/hermes-agent/venv/bin/hermes" --version || true
command -v codex && codex --version || true
command -v claude && claude --version || true

mkdir -p "$HOME/.local/bin"
ln -sfn "$EXTERNAL_DIR/openclaw/openclaw.mjs" "$HOME/.local/bin/openclaw"
ln -sfn "$EXTERNAL_DIR/hermes-agent/venv/bin/hermes" "$HOME/.local/bin/hermes"

echo "Services are installed under $EXTERNAL_DIR."
echo "CLI shims updated in $HOME/.local/bin."
