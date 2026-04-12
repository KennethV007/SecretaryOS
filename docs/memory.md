# Memory

## Purpose
Memory is external to the model so assistant continuity survives model swaps, tool changes, and workflow specialization.

## Layers

### MemPalace
- raw transcript storage
- semantic retrieval
- long-horizon recall

### Structured metadata store
- durable facts
- task and project links
- scoped preferences
- retrieval hints and tags

## Memory kinds
- conversation
- project
- task
- preference
- persona
- repo
- event

## Scope boundaries
- `global`
- `project`
- `persona`
- `after_hours`

After-hours memory must not be retrieved into assistant or planner execution unless it is explicitly promoted into a shared durable fact.

## Retrieval flow
1. Identify project, persona, and mode context.
2. Query structured metadata for exact matches and pinned context.
3. Query MemPalace for semantic recall.
4. Rerank and compress retrieved items.
5. Inject only relevant memory into the workflow input.

## Write policy
- Always store raw conversational artifacts in the memory layer.
- Promote only durable and actionable facts into structured metadata.
- Tag memories by project, topic, and persona when known.
- Keep write paths deterministic so the worker can explain why a memory was stored.
