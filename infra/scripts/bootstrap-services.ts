import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type StepResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
};

async function run(command: string, args: string[]): Promise<StepResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    command,
    args,
    stdout,
    stderr,
  };
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];

    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) {
      parts.push(stderr.trim());
    }

    return parts.join("\n");
  }

  return String(error);
}

async function isExecutableAvailable(command: string): Promise<boolean> {
  try {
    await run("bash", ["-lc", `command -v ${JSON.stringify(command)}`]);
    return true;
  } catch {
    return false;
  }
}

async function ensurePipPackage(packageName: string): Promise<void> {
  const python = process.env.PYTHON_BIN || "python3";
  const check = await run(python, ["-m", "pip", "show", packageName]).catch(
    () => undefined,
  );

  if (check) {
    return;
  }

  const installArgs = ["-m", "pip", "install", "--user", packageName];

  try {
    console.log(
      `[setup] installing ${packageName} with ${formatCommand(python, installArgs)}`,
    );
    const result = await run(python, installArgs);

    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
  } catch (error) {
    const errorText = getErrorText(error);

    if (!errorText.includes("externally-managed-environment")) {
      throw error;
    }

    const fallbackArgs = [
      "-m",
      "pip",
      "install",
      "--user",
      "--break-system-packages",
      packageName,
    ];

    console.warn(
      `[setup] ${packageName} hit a managed-Python restriction, retrying with --break-system-packages`,
    );
    console.log(
      `[setup] installing ${packageName} with ${formatCommand(python, fallbackArgs)}`,
    );

    const result = await run(python, fallbackArgs);

    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
  }
}

async function ensureMemPalace(): Promise<void> {
  await ensurePipPackage("mempalace");

  const available = await isExecutableAvailable("mempalace");

  if (!available) {
    console.log(
      "[setup] mempalace installed, but the command is not on PATH yet. Add your Python user scripts directory to PATH.",
    );
  }

  const python = process.env.PYTHON_BIN || "python3";
  await run(python, ["-m", "mempalace", "--help"]);
}

async function ensureChatterbox(): Promise<void> {
  await ensurePipPackage("chatterbox-tts");

  const python = process.env.PYTHON_BIN || "python3";
  await run(python, ["-c", "import chatterbox"]).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Chatterbox import check failed: ${message}`);
  });
}

export async function bootstrapServices(): Promise<void> {
  await ensureMemPalace();
  await ensureChatterbox();

  console.log("[setup] local service bootstrap complete");
  console.log("[setup] MemPalace is configured through MEMPALACE_COMMAND");
  console.log(
    "[setup] Chatterbox is installed as chatterbox-tts; wire a local service wrapper if you want live voice synthesis",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  bootstrapServices().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
}
