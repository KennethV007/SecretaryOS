# Safety And Approvals

## Approval classes

### Class 0
Safe reads, planning, memory retrieval, reporting, and dry analysis.

### Class 1
Low-risk reversible actions or actions that can run safely in preview mode.

### Class 2
Explicit user approval required before execution. Examples include pushes, destructive file moves, and global persona or model changes.

### Class 3
Locked or highly sensitive actions such as secrets handling, dangerous shell operations, or system-level destructive work.

## Operating rules
- Never bypass approval classification.
- Prefer dry-run and preview outputs when possible.
- Log the action, classification, and justification for every approval request.
- Keep policy decisions deterministic and auditable.
