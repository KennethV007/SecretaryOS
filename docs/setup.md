# SecretaryOS Setup

This repository runs as a pnpm TypeScript monorepo with local Postgres and Redis.

## Prerequisites

- Node.js 20 or newer
- `pnpm` 10
- Docker Desktop or another Docker runtime
- Optional, for live integrations:
  - Codex MCP command or wrapper available locally
  - MemPalace CLI installed, or installed by the bootstrap command
  - Discord bot token, client ID, and guild ID

## Initial Setup

1. Copy `.env.example` to `.env`.
2. Fill in the required secrets in `.env`.
3. Install dependencies:
   - `pnpm install`
4. Run guided onboarding:
   - `pnpm onboard`
   - `pnpm onboard` now:
     - creates `.env` if missing
     - detects local port collisions for Postgres and Redis and rewrites `.env` to safe host ports
     - tries to start Docker Desktop on macOS if the daemon is not already running
     - starts local Postgres and Redis with Docker
     - waits for both services to become reachable
     - runs database migrations automatically
     - bootstraps Python-side local services
     - opens the interactive model/persona configuration flow
5. Re-open or edit behavioral settings later:
   - `pnpm configure`
   - `pnpm configure` now attempts interactive mode by default, including a `/dev/tty` fallback for terminals with unreliable TTY detection
   - If your terminal still does not prompt, force the interactive flow with `pnpm configure -- --interactive`
6. Generate the database migration artifacts if needed:
   - `pnpm db:generate`
7. Apply database migrations:
   - `pnpm db:migrate`
8. Validate the workspace:
   - `pnpm typecheck`
   - `pnpm lint`

## Environment Variables

Minimum required values:

- `DATABASE_URL`
- `REDIS_URL`
- `API_BASE_URL` should point to the API, which defaults to `http://127.0.0.1:3001`
- `SESSION_SECRET`
- `INTERNAL_API_KEY`
- `PERSONA_PACK_ROOT` if you want to relocate persona packs from `data/persona-packs/`
- `ACTIVE_CHARACTER_PATH` if you want to relocate the persisted global active character file from `data/active-character.json`
- `SETTINGS_PATH` if you want to relocate `config/settings.json`

Optional service-specific values:

- `CODEX_MCP_COMMAND`
- `CODEX_MCP_ARGS`
- `CODEX_DEFAULT_MODEL`
- `CODEX_ASSISTANT_MODEL`
- `CODEX_PLANNER_MODEL`
- `CODEX_AFTER_HOURS_MODEL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `MEMPALACE_COMMAND`
- `MEMPALACE_ARGS`
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_ALLOWED_USER_IDS`

## Running the Services

Recommended order:

1. Start Postgres and Redis with Docker:
   - `pnpm docker:up`
2. Start the API:
   - `pnpm start:api`
3. Start the worker:
   - `pnpm start:worker`
4. Start the dashboard:
   - `pnpm start:dashboard`
5. Start the Discord gateway if you have credentials:
   - `pnpm start:gateway`

These are long-running processes. They keep the terminal occupied while they are running. Use separate terminal tabs/windows, `tmux`, or a process manager if you want multiple services up at once.

Service roles:

- API: the HTTP control plane. The dashboard and gateways talk to this service.
- Worker: the async execution loop. It pulls tasks from Redis/BullMQ, runs Codex and skills, and records results.
- Dashboard: the web UI.
- Gateway: the Discord adapter only. It should stay thin and send stateful work through the API.

Convenience commands:

- `pnpm start:backend` runs API and worker together through Turbo.
- `pnpm start:core` starts API, worker, and configured gateway in the background, without the dashboard.
- `pnpm start:gateway` starts only the Discord gateway.
- `pnpm start:all` starts API, worker, dashboard, and Discord gateway in the background.
- `pnpm stop:all` stops the background services started by `pnpm start:all`.
- `pnpm status:all` shows the current background service state.
- `pnpm reset:local` removes the repo-managed Postgres/Redis Docker volumes so onboarding can recreate a clean local database.

Background runtime details:

- PID state file: `.runtime/services.json`
- Logs: `.runtime/logs/*.log`
- The Discord gateway is skipped by `pnpm start:all` if `DISCORD_BOT_TOKEN` or `DISCORD_CLIENT_ID` is missing.

## Codex Runtime

This repo is configured for a local Codex CLI runtime, not a direct SDK client.

Recommended defaults on this machine:

- `CODEX_MCP_COMMAND=/opt/homebrew/bin/codex`
- `CODEX_MCP_ARGS=exec --skip-git-repo-check --color never -m {model}`

How it works:

- The worker pipes each task prompt to `codex exec` over stdin.
- `{model}` in `CODEX_MCP_ARGS` is replaced at runtime with the lane-specific model from the task router.
- Reasoning effort is applied through Codex config overrides using `model_reasoning_effort`, because the installed `codex exec` command does not expose a `--reasoning-effort` flag.
- If `CODEX_MCP_COMMAND` is empty, the worker falls back to the static executor for local dry-run behavior.

## OpenRouter Through Codex

OpenRouter is now routed through the Codex CLI's custom-provider path.

- If a lane in `config/settings.json` uses `openrouter`, SecretaryOS still invokes `codex exec`.
- At runtime, it adds Codex config overrides for:
  - `model_provider="openrouter"`
  - `model_providers.openrouter.base_url`
  - `model_providers.openrouter.env_key="OPENROUTER_API_KEY"`
  - `model_providers.openrouter.wire_api="chat"`
- The lane model from `config/settings.json` is passed as the selected model.

This keeps Codex as the execution surface while allowing an external Responses-compatible provider path.

## Redis

Redis is local by default. There is no hosted-account field in the default setup because the repo expects the Docker service from `infra/docker/compose.yaml`.

- Default URL: `redis://localhost:6379`
- Compose service: `redis`
- Purpose: BullMQ queue transport for task handoff between the API and the worker

If you want a hosted Redis later, replace `REDIS_URL` in `.env` with your provider URL.

Port collision behavior:

- If `5432` is already occupied, `pnpm setup` automatically moves SecretaryOS Postgres to the next free port and rewrites `DATABASE_URL`.
- If `6379` is already occupied, `pnpm setup` automatically moves SecretaryOS Redis to the next free port and rewrites `REDIS_URL`.
- The Docker Compose file uses `POSTGRES_HOST_PORT` and `REDIS_HOST_PORT` from `.env`, so the container ports stay stable even if the host ports move.
- The API listens on `3001` by default and the dashboard listens on `3000` by default.

If onboarding or migrations leave the local Docker database in a partial state during early development, run:

- `pnpm reset:local`
- `pnpm onboard`

Quick verification:

1. Confirm the CLI exists:
   - `which codex`
2. Confirm auth is already available:
   - `codex login`
3. Sanity-check non-interactive execution:
   - `printf 'Reply with OK' | codex exec --color never --skip-git-repo-check -m gpt-5.3-codex`

## Settings File

Behavioral defaults now live in `config/settings.json`.

Use this file for:

- default conversation provider/model
- default conversation reasoning effort
- default coding provider/model
- default coding reasoning effort
- planner model
- planner reasoning effort
- after-hours model
- after-hours reasoning effort
- OpenRouter enablement and base URL

Keep secrets and infra values in `.env`, including:

- `OPENROUTER_API_KEY`
- `DISCORD_BOT_TOKEN`
- `DATABASE_URL`
- `REDIS_URL`
- `CODEX_MCP_COMMAND`

## Validation

Run these after changes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @secretaryos/api test`
- `pnpm --filter @secretaryos/orchestrator test`
- `pnpm --filter @secretaryos/skills test`
- `pnpm --filter @secretaryos/codex-runtime test`
- `pnpm --filter @secretaryos/memory test`
- `pnpm --filter @secretaryos/gateway-discord test`

## Notes

- The worker no longer expects an OpenAI API key for the default path. It expects a local Codex CLI command. If you select OpenRouter for a lane, you also need `OPENROUTER_API_KEY`.
- Database migration application requires a running local Postgres instance.
- Persona packs are file-backed and live under `data/persona-packs/` by default. The dashboard can create new packs, upload profile/gallery images, and store the character definition markdown alongside the prompt files.
- The globally active Discord character is persisted separately in `data/active-character.json` by default, and `/character` switches that file as well as the bot profile.
- `pnpm onboard` performs first-run checks, starts Docker if available, bootstraps local Python services, ensures `config/settings.json` exists, and launches the interactive settings flow.
- `pnpm configure` now attempts interactive prompts by default and falls back to binding `/dev/tty` automatically when `stdin` and `stdout` do not present as TTYs.
- If the setup flow is run from a truly non-interactive shell with no usable terminal, it will keep the current settings and print a notice instead of prompting.
- `pnpm configure -- --interactive` remains available as an explicit fallback to force `/dev/tty` prompt handling.
- The interactive configure flow now lets you move through the Codex model list with arrow keys and then pick an allowed reasoning effort for each lane.
- `pnpm configure` only edits `config/settings.json` and validates provider-related env requirements.
- `pnpm setup:services` installs `mempalace` and `chatterbox-tts` via `python3 -m pip` if they are missing.
- On Homebrew-managed Python, the bootstrap automatically retries with `--break-system-packages` if pip reports an externally managed environment.
- The default MemPalace env values use `python3 -m mempalace`, so the binary does not need to be on PATH.
- This bootstrap installs the Python packages locally and verifies they import cleanly. It does not start a separate background service process for MemPalace or Chatterbox.
