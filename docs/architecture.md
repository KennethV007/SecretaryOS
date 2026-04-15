# Architecture

## System overview
SecretaryOS is organized as a TypeScript monorepo with app entrypoints in `apps/` and shared domain modules in `packages/`. The design goal is explicit contracts between layers so routing, memory, policy, and task execution remain modular.

## Top-level flow
User request -> gateway -> session manager -> orchestrator -> Codex runtime and skills -> memory writeback -> response and task updates

## Applications

### `apps/api`
- request normalization
- session state
- mode and persona resolution
- policy checks
- task creation and status APIs

### `apps/worker`
- Codex workflow execution
- background skills
- memory processing
- proactive scheduling

### `apps/gateway-discord`
- Discord message intake
- slash commands
- approval prompts
- task status updates

### `apps/dashboard`
- visibility into tasks, approvals, memory, personas, and usage

### `apps/gateway-voice` and `apps/gateway-imessage`
- reserved integration surfaces for future channels

## Packages

### `packages/core`
Shared enums, base types, and request/task contracts.

### `packages/orchestrator`
Workflow selection, routing, and task packet construction.

### `packages/codex-runtime`
Codex workflow definitions and execution request builders.

### `packages/memory`
MemPalace retrieval, transcript mining, and memory context assembly.

### `packages/policy`
Approval classification and gating rules.

### `packages/skills`
Skill registry and execution contracts.

### `packages/personas`
Persona definitions and persona-safe resolution.

### `packages/events`
Cross-service event envelopes for task and approval updates.

### `packages/telemetry`
Usage and runtime instrumentation contracts.

### `packages/db`
Structured data shapes for sessions, tasks, approvals, and memory metadata.

### `packages/prompts`
Mode and workflow prompt builders kept separate from orchestration code.

## Task lifecycle
- `queued`
- `planning`
- `running`
- `awaiting_approval`
- `completed`
- `failed`

## Safety model
Reads, planning, and reporting stay in low approval classes. Risky writes, global changes, and destructive operations are escalated through the policy layer before the worker executes them.
