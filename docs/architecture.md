# OPC SkillOS Agent Center Architecture

This implementation follows `docs/opc_skillos_spec_main.md` as the source of truth.

OpenClaw Gateway is treated as the execution and orchestration layer, HermesAgent as the
cognitive and skill-evolution layer, Obsidian as the knowledge store, and this Web app as
the visible cockpit. Phase 0-2 are mock-first: no real Gateway, Hermes, Obsidian, Codex,
or Claude Code connections are opened.

The repository is organized as a pnpm workspace:

- `apps/web`: React 19 + TypeScript + Vite cockpit UI.
- `packages/core`: Zod schemas and inferred TypeScript domain types.
- `packages/design-tokens`: liquid-glass CSS variables and shell background.
- `packages/ui`: reusable glass UI primitives.
- `data/mock`: schema-valid OPC mock data for the first cockpit screens.

The future Bridge process described in the spec will sit between the UI and external
systems. For now the UI imports mock data and validates it with `packages/core` schemas.
