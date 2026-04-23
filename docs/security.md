# OPC SkillOS Security Notes

## Default Boundary

The system defaults to local-first mock mode. Remote Gateway access must use protected transport such as `wss`, HTTPS, Tailscale, or another trusted tunnel. Frontend code must not persist high-privilege secrets.

## Prompt Injection

External content from web pages, IM, email, notes, and files is treated as data. Text that asks an agent to ignore instructions, export secrets, run commands, or bypass review is not executable instruction.

## S3/S4 Approval

S3/S4 actions require notification-center approval before execution. This includes sending messages or email, publishing, modifying code for push/merge, production writes, database writes, deletion, payment, DNS/cloud changes, and any secret access.

## Log Redaction

Bridge logs redact keys containing:

- `api_key`
- `secret`
- `token`
- `password`
- `authorization`
- `cookie`
- `private_key`
- `ssh_key`
- `session`
- `bearer`

## Token Strategy

Phase 3-10 keep tokens in process memory from `.env.local` or password inputs. Tokens are not written to localStorage, URLs, logs, mock data, or committed files. Future production storage should use OS keychain APIs.
