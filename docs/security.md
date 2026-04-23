# Security Notes

## Secrets

- OpenClaw Gateway tokens are read from environment/session configuration only.
- Frontend token inputs must use `sessionStorage` for the current browser session. Do not use `localStorage`.
- `.env`, `.env.*`, LanceDB data, `*.jsonl`, and generated archives are excluded from Git.
- Bridge log output must pass through `sanitizeLog()` before printing structured objects.

## Memory Data

- LanceDB embedded files live under `~/.openclaw/memory/lancedb` by default.
- Memory content is never written to Bridge logs during Ollama embedding calls.
- Bulk delete and soft delete flows require explicit confirmation in the UI.
- Soft delete writes `archived_at`; physical deletion is reserved for later retention jobs.

## OpenClaw Gateway

- Gateway auth material must not be hardcoded into source, mocks, fixtures, docs, or commits.
- Live mode uses `OPENCLAW_MODE=live` and `OPENCLAW_GATEWAY_URL`; mock fallback remains enabled if the Gateway is unreachable.
- The current WebSocket adapter maps observed Gateway events and keeps the auth challenge-response handshake as a TODO until the stable protocol is confirmed.

## Evolver Review Boundary

`skill_patch_review_required` changes require approval before application:

- tool call sequences
- execution steps
- conditional logic
- output schemas
- S3/S4 actions

Allowed automatic edits remain limited to descriptions, comments, tags, examples, and non-logic prompt wording.
