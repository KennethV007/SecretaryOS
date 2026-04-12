Perfect — I’m going to convert everything we designed into a **clean, production-ready Codex instruction system** you can paste directly into your repo.

This will include:

* `AGENTS.md` (Codex-facing brain)
* `/docs` folder (structured source of truth)

---

# 📁 1. `AGENTS.md` (ROOT)

Paste this at the root of your repo:

```md
# AGENTS.md

## Project Overview

This repository contains **SecretaryOS**, a Codex-first personal assistant framework designed to run locally on a Mac Studio 24/7.

Core principles:
- Codex is the primary reasoning and execution engine
- MemPalace provides long-term semantic memory
- The system supports Assistant, Planner, and After Hours modes
- Discord is the primary interface (v1)
- A dashboard provides visibility into tasks, memory, usage, and approvals
- The system is modular, safe, and extensible

---

## Source of Truth

Before making changes, consult:

- `docs/product-spec.md`
- `docs/architecture.md`
- `docs/memory.md`
- `docs/workflows.md`
- `docs/personas.md`
- `docs/safety-and-approvals.md`

If a task touches one of these areas, read the relevant file first.

---

## Architecture Rules

- Codex is the default brain for reasoning and execution
- Orchestration must be deterministic (do NOT hide control flow inside prompts)
- MemPalace is used for semantic recall; structured data lives in Postgres
- Modes and Personas are separate:
  - Modes = behavior (assistant / planner / after_hours)
  - Personas = style and identity
- After Hours memory must not leak into coding/planning workflows
- All risky actions must go through approval logic
- Prefer small composable services over monoliths

---

## Modes

- **Assistant** → general tasks, tool usage, system interaction
- **Planner** → deep thinking, architecture, breakdowns
- **After Hours** → immersive conversation, roleplay, personality-heavy

---

## Task Execution Rules

For complex tasks:

1. Understand request
2. Identify affected systems
3. Read relevant docs
4. Produce a concise plan
5. Execute incrementally
6. Validate results
7. Summarize clearly

For engineering tasks, follow:

- PM → Dev → Reviewer → Docs

---

## Safety and Approvals

Approval classes:

- Class 0: safe reads, planning, memory retrieval
- Class 1: low-risk or reversible actions
- Class 2: requires explicit approval (git push, file moves, config changes)
- Class 3: restricted (secrets, destructive system operations)

Never execute Class 2+ actions without approval.

---

## Coding Standards

- Use TypeScript by default
- Keep functions small and readable
- Use strong typing and validation
- Avoid unnecessary dependencies
- Maintain modular architecture
- Do not duplicate logic
- Update docs when architecture changes

---

## Memory Rules

- Store all transcripts in memory layer
- Only store durable facts in structured DB
- Tag memory by project / topic / persona
- Respect memory scope boundaries

---

## Testing & Validation

Before finishing:

- Run lint/tests if available
- Do not assume correctness
- Clearly state limitations
- Identify follow-ups if needed

---

## When Unsure

- Check `docs/`
- Prefer safe minimal changes
- Ask for approval when needed
- Keep the system maintainable
```

---

# 📁 2. `/docs/product-spec.md`

```md
# Product Specification

## Project Name
SecretaryOS

## Vision

A 24/7 local-first personal AI assistant that:
- acts as a single conversational interface
- delegates complex work to Codex
- maintains long-term memory
- supports coding, planning, and roleplay

---

## Core Features (MVP)

- Codex-powered assistant
- Discord interface
- Task system with queue + workers
- Repo execution workflows
- File system management
- Markdown runbook execution
- MemPalace integration
- Persona switching
- Mode switching
- Usage tracking
- Approval system
- Dashboard UI

---

## Modes

### Assistant
Handles:
- general questions
- system commands
- skill execution

### Planner
Handles:
- architecture
- deep reasoning
- task breakdowns

### After Hours
Handles:
- roleplay
- casual conversation
- personality immersion

---

## MVP Scope

### Included
- Monorepo
- API + worker services
- Discord gateway
- Dashboard
- Codex workflows
- Memory integration
- Approvals
- Basic skills

### Excluded (later phases)
- Full voice system
- iMessage production integration
- Mobile app
- multi-user system

---

## Key User Stories

- User can describe a coding task → Codex builds it
- User can run repo operations remotely
- User can execute structured markdown plans
- User can chat casually with assistant
- User can switch personalities instantly
- User receives proactive follow-ups

---

## Success Criteria

- Fully functional Codex delegation pipeline
- Persistent memory across sessions
- Safe automation with approvals
- Clean dashboard visibility
```

---

# 📁 3. `/docs/architecture.md`

```md
# Architecture

## System Overview

SecretaryOS is a modular system composed of:

- Gateway layer (Discord)
- Session manager
- Orchestrator
- Codex runtime
- Memory system (MemPalace)
- Skill runtime
- Task queue
- Dashboard

---

## Core Flow

User → Gateway → Session Manager → Orchestrator → Codex / Skills → Memory → Response

---

## Services

### API
- request handling
- session management
- task creation
- approvals

### Worker
- executes tasks
- runs Codex workflows
- processes memory
- handles proactive jobs

### Dashboard
- UI for monitoring system

### Discord Gateway
- main user interface

---

## Codex Architecture

- Secretary (entrypoint)
- PM agent (planning)
- Dev agent (implementation)
- Reviewer (validation)
- Docs (documentation)

---

## Memory

Two-layer system:

### MemPalace
- semantic recall
- transcript storage

### Postgres
- structured memory
- events
- metadata

---

## Task System

States:
- queued
- planning
- running
- awaiting_approval
- complete
- failed

---

## Skills

Modular tools:
- filesystem
- git
- repo analysis
- markdown execution
- usage reporting

---

## Safety

Approval system gates:
- destructive actions
- repo writes
- config changes
```

---

# 📁 4. `/docs/memory.md`

```md
# Memory System

## Overview

Memory is handled using:
- MemPalace (semantic memory)
- Postgres (structured metadata)

---

## Memory Types

- conversation
- project
- event
- preference
- persona
- repo
- task

---

## Storage Rules

Always:
- store raw transcripts

Sometimes:
- store semantic memory

Rarely:
- store structured memory

---

## Retrieval Flow

1. detect context
2. query structured DB
3. query MemPalace
4. rerank
5. inject into Codex

---

## Scope

- global
- project
- persona
- after_hours

After Hours memory must be isolated.
```

---

# 📁 5. `/docs/workflows.md`

```md
# Workflows

## chat_assistant
Default interaction

## planner_deep_dive
Architecture and planning

## repo_execute
PM → Dev → Reviewer → Docs

## repo_audit
- lint
- tests
- dependencies
- security

## markdown_runbook_execute
- parse markdown
- create steps
- execute sequentially

## filesystem_reorg
- preview first
- execute after approval

## after_hours_chat
- persona-heavy conversation
```

---

# 📁 6. `/docs/personas.md`

```md
# Personas

## Concept

Personas define style and identity.
Modes define behavior.

---

## Structure

Each persona includes:
- name
- style
- traits
- formatting rules
- memory scope

---

## Rules

- Personas must not affect system safety
- After Hours personas use separate memory scope
- Personas can be swapped at runtime

---

## Example

Secretary Default:
- warm
- organized
- efficient
```

---

# 📁 7. `/docs/safety-and-approvals.md`

```md
# Safety and Approvals

## Approval Classes

Class 0:
- reads
- planning

Class 1:
- low-risk reversible actions

Class 2:
- requires approval
- git push
- file moves

Class 3:
- restricted
- secrets
- system-level operations

---

## Rules

- never bypass approvals
- always log actions
- support dry-run when possible
```

---

# ✅ Final Result

You now have:

* a **Codex-native instruction system**
* a **clean AGENTS.md**
* a **modular docs architecture**
* a **scalable foundation for your entire system**

---

# 🚀 Next Step (important)

Now that this exists, the **VERY next thing you should do** is:

👉 Paste your `AGENTS.md` into the repo
👉 Then run Codex with:

> “Read AGENTS.md and begin Milestone 1 from the project plan”

---

