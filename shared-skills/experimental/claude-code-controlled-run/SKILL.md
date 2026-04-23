---
name: claude-code-controlled-run
description: Prepare a controlled Claude Code coding run behind approval and isolated workspace rules.
version: 0.1.0
metadata:
  opc:
    domain: coding
    risk: S3
    owner_agent: agent-dev-operator
    approval_required: true
    lifecycle: experimental
    trust: review_required
    runner: builtin.claude_code_controlled_run
    writes:
      - repo-workspace
    capabilities:
      - coding_agent.claude_code.controlled_run
---

# claude-code-controlled-run

1. Create a coding run plan.
2. Require approval before execution.
3. Run in an isolated workspace only when feature flags and allowed roots permit it.
4. Never push, merge, deploy, or delete user data.
