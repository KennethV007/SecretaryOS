# SecretaryOS

SecretaryOS is a Codex-first local assistant framework designed to run continuously on a Mac Studio. The initial scaffold in this repository establishes the project docs, workspace layout, and shared TypeScript contracts for the first implementation pass.

## Current shape
- `apps/` contains the API, worker, gateway, and dashboard entrypoints
- `packages/` contains shared contracts and domain modules
- `docs/` is the source of truth for product, architecture, memory, personas, safety, and workflows
- `infra/` and `data/` hold operational assets and runtime artifacts

## Getting started
1. Copy `.env.example` to `.env` and fill in the required secrets.
2. Install dependencies with `pnpm install`.
3. Run `pnpm onboard` for the guided first-run flow.
   `pnpm onboard` now handles Docker startup, local Postgres/Redis port conflicts, and database migrations automatically.
4. Run `pnpm configure` any time you want to reopen the interactive settings flow. Use `pnpm configure -- --interactive` only if your terminal still fails to prompt.
5. Start services as needed with `pnpm start:api`, `pnpm start:worker`, `pnpm start:dashboard`, and `pnpm start:gateway`.
6. Run `pnpm typecheck` and `pnpm lint`.
7. See [docs/setup.md](/Users/macstudio/Desktop/Projects/Secretary%20OS/docs/setup.md) for the full setup guide.

## Local services
- Postgres is exposed on `localhost:5432`
- Redis is exposed on `localhost:6379`
- Docker Compose lives at `infra/docker/compose.yaml`

## Developer tooling
- `pnpm onboard` runs the guided onboarding flow
- `pnpm configure` opens the interactive model/provider picker and updates `config/settings.json`
- `pnpm configure -- --interactive` is an explicit fallback that forces prompts through `/dev/tty`
- The configure flow includes a scrollable Codex model picker plus reasoning-effort selection per lane
- `pnpm start:gateway` starts the Discord gateway
- `pnpm start:backend` starts the API and worker together
- `pnpm start:core` starts API, worker, and configured gateway in the background without the dashboard
- `pnpm start:all` starts API, worker, dashboard, and configured gateway in the background
- `pnpm stop:all` stops the background services started by `pnpm start:all`
- `pnpm status:all` shows background service state and log locations
- `pnpm typecheck` runs workspace TypeScript validation
- `pnpm lint` runs package checks plus Biome
- `pnpm format` applies Biome formatting
- `docs/implementation-log.md` records step timing during active implementation runs

## Status
This is a bootstrap workspace, not a finished product. The app and package entrypoints are intentionally thin so the next implementation slices can add real runtime behavior without undoing speculative code.
