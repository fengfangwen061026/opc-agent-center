#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export OPENCLAW_MODE="${OPENCLAW_MODE:-cli}"
export OPENCLAW_GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-ws://127.0.0.1:18789}"
export OPENCLAW_CLI_PATH="${OPENCLAW_CLI_PATH:-$ROOT_DIR/external/openclaw/openclaw.mjs}"
export HERMES_MODE="${HERMES_MODE:-cli}"
export HERMES_CLI_PATH="${HERMES_CLI_PATH:-$ROOT_DIR/external/hermes-agent/venv/bin/hermes}"
export OBSIDIAN_MODE="${OBSIDIAN_MODE:-mock}"
export OBSIDIAN_API_URL="${OBSIDIAN_API_URL:-https://127.0.0.1:27124}"
export CODEX_CLI_PATH="${CODEX_CLI_PATH:-$(command -v codex || true)}"
export CLAUDE_CLI_PATH="${CLAUDE_CLI_PATH:-$(command -v claude || true)}"

echo "OPC SkillOS runtime paths:"
echo "  OPENCLAW_MODE=$OPENCLAW_MODE"
echo "  OPENCLAW_CLI_PATH=$OPENCLAW_CLI_PATH"
echo "  HERMES_MODE=$HERMES_MODE"
echo "  HERMES_CLI_PATH=$HERMES_CLI_PATH"
echo "  OBSIDIAN_MODE=$OBSIDIAN_MODE"
echo "  CODEX_CLI_PATH=${CODEX_CLI_PATH:-not found}"
echo "  CLAUDE_CLI_PATH=${CLAUDE_CLI_PATH:-not found}"
echo
echo "TODO: OpenClaw Gateway daemon and Obsidian plugin still require each product's own pairing/auth flow."
echo "Starting Bridge + Web with adapter fallbacks..."

pnpm dev
