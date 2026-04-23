#!/usr/bin/env bash
set -euo pipefail

HERMES_BIN="${HERMES_CLI_PATH:-hermes}"
PROFILE_NAME="${HERMES_PROFILE:-opc-kernel}"

if ! command -v "$HERMES_BIN" >/dev/null 2>&1 && [[ ! -x "$HERMES_BIN" ]]; then
  echo "Hermes CLI not found: $HERMES_BIN"
  echo "Run: pnpm services:install"
  exit 1
fi

if ! "$HERMES_BIN" profile --help >/dev/null 2>&1; then
  echo "This Hermes CLI does not expose 'profile' help. Use 'hermes model' or 'hermes setup'."
  exit 0
fi

echo "Hermes profile support detected."
echo "No secrets will be copied automatically."
echo
echo "Suggested manual setup:"
echo "  $HERMES_BIN profile create $PROFILE_NAME --clone"
echo "  $HERMES_BIN model"
echo "  $HERMES_BIN doctor"
echo
echo "If your shell creates a profile alias, test with:"
echo "  $PROFILE_NAME chat -q \"hello\""
