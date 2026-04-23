---
name: codex-controlled-run
description: Prepare a controlled Codex coding run behind approval and isolated workspace rules.
version: 0.1.0
metadata:
  opc:
    domain: coding
    risk: S3
    owner_agent: agent-dev-operator
    approval_required: true
    lifecycle: experimental
    trust: review_required
    runner: builtin.codex_controlled_run
    writes:
      - repo-workspace
    capabilities:
      - coding_agent.codex.controlled_run
---

# codex-controlled-run

1. Create a coding run plan.
2. Require approval before execution.
3. Run in an isolated workspace only when feature flags and allowed roots permit it.
4. Never push, merge, deploy, or delete user data.
