# SecretaryOS

SecretaryOS is a Codex-first local personal assistant framework built to run continuously on a Mac. It includes a Fastify API, BullMQ worker, Next.js dashboard, Discord gateway, persona packs, durable memory, approvals, and a unified skill library that merges SecretaryOS skills with live Codex skills.

## What is here

- `apps/api` - HTTP control plane for sessions, tasks, approvals, personas, memory, skills, replay/eval data, and internal worker updates
- `apps/worker` - async task execution, Codex runtime invocation, markdown runbooks, and conservative durable-memory promotion
- `apps/dashboard` - status UI for chat, tasks, approvals, personas, memory, usage, and skills
- `apps/gateway-discord` - Discord channel adapter and `/character` support
- `packages/*` - shared contracts and domain modules for orchestration, personas, policy, skills, memory, runtime, telemetry, and self-improvement surfaces
- `docs/*` - product, architecture, safety, memory, persona, workflow, and setup docs

## Getting started

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   - `pnpm install`
3. Run first-time onboarding:
   - `pnpm onboard`
4. Reopen the interactive model/provider configuration whenever needed:
   - `pnpm configure`
5. Start the runtime:
   - `pnpm start:core` for API + worker + optional Discord gateway
   - `pnpm start:all` for API + worker + dashboard + optional Discord gateway
6. Open the dashboard:
   - `http://localhost:3000`

Use [docs/setup.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/setup.md) for the full setup and runtime guide.

## Runtime model

- API default: `http://localhost:3001`
- Dashboard default: `http://localhost:3000`
- Postgres and Redis are local Docker services, with host ports chosen from `.env`
- `pnpm onboard` handles Docker startup, host-port collision detection, service bootstrap, and migrations
- `pnpm start:all`, `pnpm start:core`, `pnpm stop:all`, and `pnpm status:all` are managed by the detached local service runner

## Skills and memory

- SecretaryOS exposes built-in skills for filesystem, git, repo maintenance, usage, persona switching, and mode switching
- The skill registry also includes live Codex skills discovered from the Codex skill root
- Importing a skill pack from the dashboard installs it into the live Codex skill root as well as the repo catalog
- Chat transcripts are session-scoped
- Durable memory is shared across chats and only stores promoted facts, not every reply

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @secretaryos/api test`
- `pnpm --filter @secretaryos/worker test`
- `pnpm --filter @secretaryos/orchestrator test`
- `pnpm --filter @secretaryos/skills test`

## Source of truth docs

- [docs/product-spec.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/product-spec.md)
- [docs/architecture.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/architecture.md)
- [docs/memory.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/memory.md)
- [docs/personas.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/personas.md)
- [docs/safety-and-approvals.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/safety-and-approvals.md)
- [docs/workflows.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/workflows.md)
