---
name: obsidian-review-note
description: Create a safe Obsidian Review Queue note preview and optionally write only to the review queue.
version: 0.1.0
metadata:
  opc:
    domain: knowledge
    risk: S2
    owner_agent: agent-knowledge-curator
    approval_required: false
    lifecycle: stable
    trust: trusted
    runner: builtin.obsidian_review_note
    reads:
      - web:public
    writes:
      - obsidian:/08_Review_Queue
    capabilities:
      - obsidian.write.review_queue
---

# obsidian-review-note

1. Build a review note preview.
2. Write only into the configured Review Queue path.
3. Never delete, overwrite, move, or edit existing notes.
