import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export async function runResetLocal(): Promise<void> {
  console.log(
    "[reset:local] stopping SecretaryOS Docker services and removing volumes",
  );
  await execFileAsync(
    "docker",
    ["compose", "-f", "infra/docker/compose.yaml", "down", "-v"],
    {
      cwd: REPO_ROOT,
    },
  );
  console.log("[reset:local] local Postgres and Redis volumes removed");
  console.log("[reset:local] rerun 'pnpm onboard' to recreate the local stack");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  runResetLocal().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
}
