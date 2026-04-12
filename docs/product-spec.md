# Product Specification

## Project name
SecretaryOS

## Vision
SecretaryOS is a local-first personal assistant framework built around Codex as the primary reasoning and execution engine. It should feel like one assistant to the user while exposing explicit system boundaries for memory, approvals, orchestration, and observability.

## Product pillars
- One assistant surface across chat, planning, and after-hours interaction
- Codex-first execution for repo work, reasoning, and delegated workflows
- Externalized memory through MemPalace plus structured metadata
- Safe automation with approval gates around risky actions
- Modular skills and channels that can evolve without rewriting the core

## MVP scope

### In scope
- monorepo with shared contracts
- API orchestrator service
- background worker
- Discord gateway
- dashboard application
- Postgres and Redis integration points
- Codex task runtime
- MemPalace integration layer
- approval workflows
- usage tracking
- markdown runbook execution
- mode and persona switching

### Out of scope
- production iMessage integration
- full duplex voice runtime
- multi-user tenancy
- unrestricted autonomous agents
- mobile app

## Modes

### Assistant
Default operational mode for user requests, tools, and low-friction execution.

### Planner
Deeper reasoning mode for architecture, decomposition, and strategy.

### After Hours
Personality-heavy mode for casual conversation and immersive interaction with isolated memory scope.

## Core user stories
- A user can describe a repository task and the system runs the right Codex workflow.
- A user can chat over Discord without losing project or preference context.
- A user can switch mode or persona without corrupting safety behavior.
- A user can execute structured markdown plans with approvals at the right boundaries.
- A user can inspect tasks, approvals, memory, and usage in the dashboard.

## Success criteria
- Deterministic orchestration around Codex workflows
- Persistent memory with explicit scope boundaries
- Traceable approval decisions for risky actions
- Clear task state visibility across the API, worker, and dashboard
