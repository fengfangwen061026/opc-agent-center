---
name: hermes-reflect-capsule
description: Ask Hermes to reflect on a Task Capsule and create reviewable memory or skill candidates.
version: 0.1.0
metadata:
  opc:
    domain: memory
    risk: S1
    owner_agent: agent-hermes
    approval_required: false
    lifecycle: stable
    trust: trusted
    runner: builtin.hermes_reflect_capsule
    capabilities:
      - hermes.reflect_task
---

# hermes-reflect-capsule

1. Read a Task Capsule summary.
2. Ask Hermes for structured reflection candidates.
3. Store candidates for human review.
