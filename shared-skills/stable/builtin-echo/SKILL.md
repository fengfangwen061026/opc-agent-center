---
name: builtin-echo
description: Echo a user request into a controlled Task Capsule without external side effects.
version: 0.1.0
metadata:
  opc:
    domain: core
    risk: S0
    owner_agent: agent-conductor
    approval_required: false
    lifecycle: stable
    trust: trusted
    runner: builtin.echo
    capabilities:
      - capsule.preview
---

# builtin-echo

1. Receive a short user request.
2. Produce a dry-run execution plan.
3. Create a Task Capsule with no external write.
