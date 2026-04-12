# AGENTS.md

## Project
This repository contains SecretaryOS, a Codex-first personal assistant framework designed to run locally on a Mac Studio 24/7.

Core goals:
- Codex is the primary reasoning and execution engine
- MemPalace provides long-term memory and semantic recall
- The system supports Assistant, Planner, and After Hours modes
- Discord is the first client interface
- The app includes a dashboard for tasks, approvals, memory, personas, and usage
- The architecture must remain modular and safe for local automation

## Source of truth
Read these docs before making major changes:

- `docs/product-spec.md` - product goals, MVP scope, milestones
- `docs/architecture.md` - services, packages, data flow, task execution
- `docs/memory.md` - MemPalace integration, memory scopes, retrieval/write rules
- `docs/personas.md` - mode/persona separation and persona pack rules
- `docs/safety-and-approvals.md` - approval classes and destructive action policy
- `docs/workflows.md` - Codex workflows such as repo_execute, planner_deep_dive, markdown_runbook_execute

If a task touches one of these areas, consult the relevant file first.

## Repository expectations
- Use TypeScript throughout unless a Python service is clearly justified
- Prefer clean modular packages over tightly coupled app logic
- Keep business logic out of UI components
- Favor explicit typed contracts between services
- Avoid giant files and duplicated logic
- Keep implementations production-oriented, but minimal when scaffolding

## Architecture rules
- Codex is the default brain for core reasoning and repo workflows
- MemPalace is the long-term memory layer, with structured metadata stored separately in the app database
- Modes and personas are separate concepts:
  - Modes = operational behavior
  - Personas = style/identity overlays
- After Hours memory must not pollute coding or planning workflows
- All risky write actions must flow through the approval system
- Prefer deterministic orchestration around Codex rather than burying control flow inside prompts

## Safety and approvals
Approval classes:
- Class 0: safe reads, planning, memory retrieval, usage reporting
- Class 1: reversible or low-risk actions, often allowed in preview/dry-run mode
- Class 2: explicit approval required for pushes, destructive file moves, global persona/model changes
- Class 3: locked/high-risk actions such as secrets handling or dangerous shell/system operations

Never perform Class 2 or Class 3 actions without following the approval policy.

## Task execution
For substantial engineering tasks:
1. scope the task clearly
2. identify affected packages/apps
3. check relevant docs
4. produce a concise plan
5. implement incrementally
6. validate with tests/lint where available
7. summarize changes clearly
8. note follow-up work if needed

For repo tasks, prefer this workflow:
- PM pass
- Dev implementation
- Reviewer validation
- Docs update if behavior/setup changed

## Coding standards
- Favor readability and maintainability over cleverness
- Add types, validation, and error handling
- Keep functions focused
- Avoid unnecessary dependencies
- Preserve existing patterns unless intentionally refactoring
- Update docs when architecture or workflow changes materially

## Testing and validation
Before finishing work:
- run relevant tests if they exist
- run lint/typecheck if configured
- call out anything not validated
- do not claim something works unless it was actually checked

## Memory-specific rules
- Store raw transcripts in the memory layer
- Only promote durable/actionable facts into structured metadata
- Tag memories by project/topic/persona where possible
- Respect scope boundaries between assistant/planner/after-hours contexts

## When in doubt
- Check the docs in `docs/`
- Prefer minimal safe changes
- Ask for approval before risky actions
- Leave the repo cleaner than you found it
