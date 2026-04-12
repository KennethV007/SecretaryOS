**SecretaryOS MVP v1**

A Codex-first local assistant framework that runs on your Mac Studio 24/7 and supports:

* Secretary chat interface
* Assistant / Planner / After Hours modes
* persona switching
* MemPalace-backed long-term memory
* Discord as first client
* dashboard for usage, tasks, and approvals
* repo task execution through Codex
* filesystem and git skills
* markdown runbook execution
* proactive follow-ups
* future support for voice and iMessage

---

# 2. MVP scope

Do **not** build everything at once.

## In scope for v1

* monorepo
* backend orchestrator
* Discord gateway
* dashboard
* Postgres + Redis
* Codex task runner
* MemPalace integration
* task queue
* approvals
* basic skills
* personas and mode switching
* usage tracking
* proactive reminders/events
* markdown execution workflow

## Out of scope for v1

* full duplex live voice
* iMessage production integration
* advanced local model hosting
* multi-user support
* fully autonomous background repo agents
* rich mobile app
* deep roleplay scene systems

---

# 3. Monorepo layout

```text
secretary-os/
  apps/
    api/
    worker/
    dashboard/
    gateway-discord/
    gateway-voice/
    gateway-imessage/
  packages/
    core/
    orchestrator/
    codex-runtime/
    memory/
    skills/
    policy/
    telemetry/
    personas/
    prompts/
    events/
    db/
    ui/
  infra/
    docker/
    scripts/
    sql/
  docs/
    architecture/
    product/
    runbooks/
  data/
    persona-packs/
    task-artifacts/
    imports/
  .env.example
  package.json
  pnpm-workspace.yaml
  turbo.json
  README.md
```

---

# 4. What each app/package does

## apps/api

Main backend entrypoint.

Responsibilities:

* receive normalized requests from dashboard/Discord
* session management
* mode resolution
* persona resolution
* memory retrieval orchestration
* policy checks
* task creation
* approval flow
* task status APIs

## apps/worker

Background jobs.

Responsibilities:

* execute Codex tasks
* run skills
* process memory writes
* schedule proactive follow-ups
* aggregate usage data
* handle markdown runbook execution

## apps/dashboard

Control center UI.

Responsibilities:

* task list
* usage charts
* memory inspector
* persona manager
* model routing page
* approvals inbox
* integrations status

## apps/gateway-discord

Discord bot.

Responsibilities:

* receive messages
* slash commands
* forward approvals
* stream task updates
* allow persona/mode changes in channel

## apps/gateway-voice

Leave as skeleton in v1.

## apps/gateway-imessage

Leave as skeleton in v1.

---

## packages/core

Shared types, enums, schemas.

Examples:

* Mode
* Persona
* TaskStatus
* ApprovalClass
* SkillDefinition
* MemoryKind

## packages/orchestrator

Business logic.

Examples:

* route incoming request
* decide workflow
* build Codex execution packet
* call memory service
* dispatch tasks

## packages/codex-runtime

All Codex-facing code.

Examples:

* Codex client wrapper
* job spec builder
* workflow launcher
* subagent templates
* artifact collector

## packages/memory

MemPalace bridge + structured memory logic.

Examples:

* transcript ingest
* semantic retrieval
* project tagging
* event extraction
* pinned facts
* memory reranking

## packages/skills

Skill registry and implementations.

## packages/policy

Approvals and risk gating.

## packages/telemetry

Usage and logs.

## packages/personas

Persona files, validators, loaders.

## packages/prompts

Prompt templates by mode and workflow.

## packages/events

Shared queue/event contracts.

## packages/db

ORM/schema/migrations helpers.

---

# 5. Suggested tech stack

## Backend

* Node.js
* TypeScript
* Fastify or NestJS
* Prisma or Drizzle
* Postgres
* Redis
* BullMQ or similar queue library

## Frontend

* Next.js
* TypeScript
* Tailwind
* shadcn/ui

## Memory

* MemPalace
* Postgres metadata tables

## Discord

* discord.js

## Infra

* Docker Compose for local dev
* pm2 or supervised services for local always-on runs

---

# 6. Environment variables

Here is a strong `.env.example` starter:

```bash
# Core
NODE_ENV=development
APP_NAME=SecretaryOS
APP_URL=http://localhost:3000
API_PORT=4000
DASHBOARD_PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/secretary_os
REDIS_URL=redis://localhost:6379

# Auth / sessions
SESSION_SECRET=change_me
INTERNAL_API_KEY=change_me

# Codex / OpenAI
OPENAI_API_KEY=change_me
CODEX_DEFAULT_MODEL=gpt-5.3-codex
CODEX_ASSISTANT_MODEL=gpt-5.3-codex-spark
CODEX_PLANNER_MODEL=gpt-5.3-codex
CODEX_AFTER_HOURS_MODEL=gpt-5.3-codex
CODEX_MAX_PARALLEL_TASKS=3

# Optional alternate models
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AFTER_HOURS_FALLBACK_MODEL=

# Discord
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_ALLOWED_USER_IDS=

# Voice
CHATTERBOX_BASE_URL=http://localhost:8001
STT_PROVIDER=
STT_API_KEY=

# Memory
MEMPALACE_BASE_URL=http://localhost:8002
MEMPALACE_ENABLED=true
MEMORY_DEFAULT_TOP_K=8
MEMORY_WRITE_ENABLED=true

# Git / GitHub
GITHUB_TOKEN=
DEFAULT_GIT_AUTHOR_NAME=SecretaryOS
DEFAULT_GIT_AUTHOR_EMAIL=secretary@example.com

# Filesystem safety
ALLOWED_WORKSPACE_ROOTS=/Users/ken/projects,/Users/ken/Documents
SAFE_DELETE_TRASH_DIR=/Users/ken/.secretary-trash

# Proactive behavior
PROACTIVE_ENABLED=true
PROACTIVE_QUIET_HOURS_START=23
PROACTIVE_QUIET_HOURS_END=9
PROACTIVE_MAX_PER_DAY=3

# Telemetry
USAGE_LOG_RETENTION_DAYS=90
TASK_ARTIFACT_DIR=./data/task-artifacts
```

---

# 7. Core enums and shared contracts

## Modes

```ts
export type Mode = "assistant" | "planner" | "after_hours";
```

## Task types

```ts
export type TaskType =
  | "chat_assistant"
  | "planner_deep_dive"
  | "repo_execute"
  | "repo_audit"
  | "filesystem_reorg"
  | "security_sweep"
  | "markdown_runbook_execute"
  | "usage_report"
  | "daily_checkin"
  | "after_hours_chat";
```

## Task status

```ts
export type TaskStatus =
  | "queued"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "review"
  | "complete"
  | "failed"
  | "canceled";
```

## Approval classes

```ts
export type ApprovalClass = 0 | 1 | 2 | 3;
```

## Memory kind

```ts
export type MemoryKind =
  | "conversation"
  | "project"
  | "event"
  | "preference"
  | "persona"
  | "repo"
  | "task";
```

---

# 8. Database schema blueprint

These are the first tables I would create.

## users

For now, you only need one, but build properly.

Fields:

* id
* name
* created_at

## sessions

Fields:

* id
* user_id
* channel
* channel_session_key
* active_mode
* active_persona_id
* created_at
* last_active_at

## personas

Fields:

* id
* slug
* name
* description
* enabled
* default_mode
* prompt_pack_path
* voice_profile
* created_at
* updated_at

## projects

Fields:

* id
* name
* slug
* repo_path
* default_branch
* codex_profile
* created_at
* updated_at

## tasks

Fields:

* id
* type
* status
* approval_class
* session_id
* project_id
* persona_id
* mode
* title
* input_text
* summary
* created_at
* started_at
* completed_at
* error_message

## task_steps

Fields:

* id
* task_id
* step_index
* label
* status
* output_text
* artifact_path
* created_at
* updated_at

## approvals

Fields:

* id
* task_id
* action_name
* reason
* requested_in_channel
* status
* requested_at
* resolved_at

## memory_items

This is your structured companion layer.

Fields:

* id
* external_memory_id
* kind
* scope
* project_id
* persona_id
* title
* content_summary
* tags
* importance
* source
* visibility
* created_at

## events

Fields:

* id
* session_id
* title
* description
* due_at
* followup_policy
* completed
* created_at

## usage_records

Fields:

* id
* provider
* model
* lane
* task_id
* input_tokens
* output_tokens
* estimated_cost
* created_at

## model_routes

Fields:

* id
* lane
* provider
* model_name
* enabled
* priority
* created_at
* updated_at

## skill_runs

Fields:

* id
* task_id
* skill_name
* input_json
* output_json
* status
* created_at

---

# 9. Skill list for MVP

These are the first skills to implement.

## Read-only/safe

* `filesystem.list`
* `filesystem.read_file`
* `filesystem.search`
* `git.status`
* `git.diff`
* `git.log_recent`
* `repo.find`
* `usage.codex.report`
* `usage.openrouter.report`
* `memory.search`
* `web.search`

## Controlled write

* `filesystem.organize_preview`
* `filesystem.move`
* `filesystem.safe_delete`
* `git.branch_create`
* `git.commit`
* `git.push`
* `repo.run_tests`
* `repo.run_lint`
* `repo.audit`
* `security.scan`
* `markdown.execute_runbook`
* `persona.switch`
* `mode.switch`

Every skill should support:

* schema validation
* dry run
* audit logging
* risk class declaration

---

# 10. Codex workflow templates

These are the main workflows your orchestrator should support.

## `chat_assistant`

Used for normal questions, help, light tasks.

Input:

* user message
* mode
* persona
* recent session context
* memory snippets

Output:

* response text
* possible follow-up suggestions
* memory write candidates

## `planner_deep_dive`

Used for architecture and planning.

Output:

* scoped plan
* milestones
* risks
* next actions
* optional task creation suggestions

## `repo_execute`

Used for real coding work.

Pipeline:

1. PM scope
2. Dev implementation
3. Reviewer validation
4. Docs pass
5. approval for push/merge if needed

## `repo_audit`

Used for health check over a repo.

Checks:

* lint
* tests
* dependency concerns
* basic security scan
* stale branches optionally

## `markdown_runbook_execute`

Reads a markdown plan and turns it into sequential actionable steps.

Output:

* parsed task graph
* progress log
* step-by-step execution state

## `filesystem_reorg`

Reorganizes files, but defaults to preview mode first.

## `after_hours_chat`

Heavier persona context, looser formatting, memory-scoped to the selected persona.

---

# 11. Prompt system structure

Do not make one giant unreadable prompt.

## A. base system prompt

Contains:

* what SecretaryOS is
* approval boundaries
* tool discipline
* truthfulness rules
* memory usage behavior

## B. mode prompt

One file per mode:

* assistant.md
* planner.md
* after_hours.md

## C. persona prompt

One file per persona.

Example structure:

```json
{
  "name": "Secretary Default",
  "style": "warm, competent, lightly playful",
  "traits": ["organized", "protective of the user's time", "clear communicator"],
  "formatting": {
    "concise_by_default": true,
    "uses_lists_for_plans": true
  },
  "memory_scope": "all"
}
```

## D. workflow prompt

Specific instructions for:

* repo_execute
* repo_audit
* markdown_runbook_execute
* after_hours_chat

---

# 12. Memory architecture with MemPalace

Use a wrapper package like `packages/memory`.

## Responsibilities

* ingest transcripts into MemPalace
* retrieve memories by semantic search
* store structured metadata in Postgres
* classify memories by project/topic/persona
* dedupe low-value writes
* surface memory candidates to Codex

## Retrieval flow

For each incoming request:

1. identify session
2. identify active mode/persona/project
3. pull recent local context
4. query structured DB for exact facts/events
5. query MemPalace with semantic query
6. rerank top results
7. build compact memory context block
8. send to Codex

## Write flow

After each completed interaction:

1. archive transcript
2. extract candidate durable facts
3. tag project/topic/persona
4. write semantic memory
5. write structured metadata if durable/actionable

## Memory scopes

* global
* project
* repo
* persona
* channel
* after_hours_only

This is how you prevent roleplay memory from polluting coding workflows.

---

# 13. Queue and events design

Use a task queue.

## Event names

* `task.created`
* `task.started`
* `task.awaiting_approval`
* `task.step.updated`
* `task.completed`
* `task.failed`
* `memory.write.requested`
* `memory.write.completed`
* `usage.recorded`
* `proactive.followup.due`

## Workers to implement

* codex worker
* memory worker
* telemetry worker
* proactive worker

---

# 14. Discord command list

Start with these.

## slash commands

* `/mode assistant`
* `/mode planner`
* `/mode after_hours`
* `/persona list`
* `/persona set <name>`
* `/usage today`
* `/usage week`
* `/task status`
* `/task cancel <id>`
* `/memory search <query>`
* `/project set <name>`
* `/approve <task>`
* `/deny <task>`

## normal chat behavior

Any plain message goes to the Secretary session manager.

---

# 15. Dashboard page checklist

## Home

* active mode
* active persona
* recent tasks
* pending approvals
* usage today
* next follow-ups

## Tasks

* filter by status
* detail page
* artifacts
* logs
* skill runs
* approvals

## Memory

* search
* inspect
* pin/unpin
* tag view
* delete or hide

## Personas

* edit persona pack
* assign voice
* enable/disable
* preview response style

## Models

* set model routes by lane
* Codex defaults
* fallback model settings

## Usage

* daily token charts
* by model
* by task type
* by project

## Integrations

* Discord status
* MemPalace status
* Codex API status
* Redis/Postgres health

---

# 16. Concrete milestone task list for Codex

This is the part you can hand over directly.

## Milestone 1 — bootstrap monorepo

**Goal:** set up repo and working services.

Tasks:

1. initialize pnpm/turbo monorepo
2. create apps/api, apps/worker, apps/dashboard, apps/gateway-discord
3. create shared packages skeleton
4. add TypeScript config setup
5. add lint/format scripts
6. add Docker Compose for Postgres + Redis
7. create `.env.example`
8. write root README with setup steps

## Milestone 2 — database and shared contracts

**Goal:** establish system data model.

Tasks:

1. add ORM
2. create initial schema for users, sessions, personas, tasks, approvals, memory_items, usage_records, events, projects
3. run first migration
4. define shared TypeScript enums and zod schemas
5. expose typed DB client in shared package

## Milestone 3 — API skeleton

**Goal:** get backend up.

Tasks:

1. create Fastify/Nest server
2. add health route
3. add session routes
4. add tasks CRUD routes
5. add approvals routes
6. add usage routes
7. add personas routes

## Milestone 4 — dashboard shell

**Goal:** create visible admin UI.

Tasks:

1. create Next.js dashboard
2. add home page
3. add tasks page
4. add memory page
5. add personas page
6. add usage page
7. connect to API health endpoint

## Milestone 5 — Discord gateway

**Goal:** talk to the system from Discord.

Tasks:

1. create Discord bot
2. connect message handler to API
3. add slash commands for mode/persona/usage
4. add basic response relay
5. add approval message actions

## Milestone 6 — orchestrator core

**Goal:** central business logic.

Tasks:

1. implement session manager
2. implement mode resolver
3. implement persona resolver
4. implement task creation service
5. implement workflow selector
6. add policy checks before task launch

## Milestone 7 — Codex runtime

**Goal:** make Codex usable as main brain.

Tasks:

1. create Codex client wrapper
2. implement `chat_assistant`
3. implement `planner_deep_dive`
4. implement `repo_execute`
5. implement artifact storage
6. stream task progress updates

## Milestone 8 — skills v1

**Goal:** useful local actions.

Tasks:

1. implement filesystem.list
2. implement filesystem.read_file
3. implement git.status
4. implement git.diff
5. implement usage.codex.report
6. implement persona.switch
7. implement mode.switch
8. implement repo.run_tests
9. implement repo.run_lint

## Milestone 9 — approvals

**Goal:** safe writes.

Tasks:

1. add approval class rules
2. block risky skills until approved
3. add approval inbox in dashboard
4. add Discord approval buttons
5. wire task resume after approval

## Milestone 10 — memory v1

**Goal:** long-term continuity.

Tasks:

1. integrate MemPalace wrapper
2. write transcript ingest
3. implement memory search API
4. implement retrieval pipeline for incoming requests
5. add structured metadata writes
6. add memory inspector page

## Milestone 11 — markdown runbook execution

**Goal:** execute giant markdown plans.

Tasks:

1. parse markdown into ordered steps
2. classify executable vs informational steps
3. create task step records
4. allow step-by-step execution through worker
5. stream progress back to Discord/dashboard

## Milestone 12 — proactive events

**Goal:** assistant follows up.

Tasks:

1. add events extraction logic
2. schedule follow-up jobs
3. add quiet-hours/rate-limit logic
4. send follow-up through Discord
5. display upcoming follow-ups in dashboard

## Milestone 13 — after hours mode

**Goal:** roleplay and casual chat lane.

Tasks:

1. add heavier persona prompt support
2. add memory filtering by persona scope
3. add persona switching in Discord/dashboard
4. add fallback model routing config even if unused initially

---

# 17. Exact first issues I would create in GitHub

Create these first:

1. `chore: initialize monorepo structure`
2. `chore: add docker compose for postgres and redis`
3. `feat(db): add initial schema and migrations`
4. `feat(api): create health and session endpoints`
5. `feat(dashboard): scaffold admin UI shell`
6. `feat(discord): create gateway bot and message relay`
7. `feat(orchestrator): implement mode and persona resolution`
8. `feat(codex): add client wrapper and assistant workflow`
9. `feat(skills): implement read-only filesystem and git skills`
10. `feat(memory): integrate MemPalace transcript ingest`
11. `feat(policy): add approval rules and approval routes`
12. `feat(tasks): add queue worker and task status updates`

---

# 18. First Codex prompt to kick off the repo

You can paste something like this into Codex:

```text
Build the initial scaffold for a monorepo project called SecretaryOS.

Requirements:
- Use TypeScript throughout.
- Use pnpm workspaces and Turborepo.
- Create apps/api, apps/worker, apps/dashboard, and apps/gateway-discord.
- Create shared packages: core, orchestrator, codex-runtime, memory, skills, policy, telemetry, personas, prompts, events, db.
- Add Docker Compose for Postgres and Redis.
- Add a root .env.example with placeholders for database, Redis, OpenAI/Codex, Discord, MemPalace, and telemetry settings.
- Add a basic README with setup instructions.
- Add linting, formatting, and shared tsconfig setup.
- Keep everything minimal but production-oriented.
- Do not implement full business logic yet. Focus on clean scaffolding and maintainable folder structure.
```

Then after that:

```text
Now implement the initial database schema and shared TypeScript contracts for:
users, sessions, personas, projects, tasks, task_steps, approvals, memory_items, events, usage_records, model_routes, and skill_runs.

Use sensible enums for mode, task status, task type, approval class, and memory kind.
Add migrations and export typed schemas from the shared db/core packages.
```

---

# 19. Recommended build order for you personally

If you want fastest visible progress:

1. scaffold monorepo
2. get dashboard and API running
3. get Discord bot talking to API
4. get Codex assistant responses flowing
5. add tasks and queue
6. add memory
7. add repo execution workflow
8. add approvals
9. add markdown runbook execution
10. add proactive follow-ups
11. polish personas
12. add voice later

That gets you to “real usable secretary” quickly.

---

# 20. Final handoff checklist

Before coding begins, confirm these decisions in your repo docs:

* monorepo manager: pnpm + turbo
* API framework: Fastify or Nest
* ORM: Prisma or Drizzle
* queue: BullMQ or equivalent
* Discord first: yes
* MemPalace integrated in v1: yes
* Codex as default brain: yes
* dashboard in v1: yes
* voice in v1: no, stub only
* iMessage in v1: no, stub only
