import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..", "..");
const ROOT_ENV_PATH = resolve(REPO_ROOT, ".env");

export function loadRepoEnv(): void {
  if (!existsSync(ROOT_ENV_PATH)) {
    return;
  }

  loadDotenv({
    path: ROOT_ENV_PATH,
    override: false,
  });
}
