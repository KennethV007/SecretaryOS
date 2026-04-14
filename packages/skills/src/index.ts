import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import type { ApprovalClass, Mode } from "@secretaryos/core";
import { createId } from "@secretaryos/core";
import { classifySkill } from "@secretaryos/policy";

const execFileAsync = promisify(execFile);

export type SkillDefinition = {
  id: string;
  summary: string;
  approvalClass: ApprovalClass | null;
  source: "secretaryos_builtin" | "codex_system" | "codex_home";
  executor: "secretaryos" | "codex";
  path?: string;
};

export type SkillPackSkillDefinition = Pick<
  SkillDefinition,
  "id" | "summary" | "approvalClass"
>;

export type SkillPackManifest = {
  id: string;
  name: string;
  summary?: string;
  skills: SkillPackSkillDefinition[];
};

export type ImportedSkillPackRecord = SkillPackManifest & {
  catalogPath: string;
  installed: boolean;
  installedPath?: string;
  liveSkillIds: string[];
};

export type SkillCatalogOptions = {
  codexSkillRoot?: string;
  env?: NodeJS.ProcessEnv;
};

export type SkillPackOptions = SkillCatalogOptions;

export type SkillExecutionContext = {
  cwd: string;
  updateMode?: (mode: Mode) => Promise<string> | string;
  updatePersona?: (personaId: string) => Promise<string> | string;
  usageSummary?: () => Promise<string> | string;
};

export type SkillExecutionResult = {
  skillId: string;
  approvalClass: ApprovalClass;
  outputText: string;
};

export type MarkdownRunbookStep = {
  id: string;
  stepIndex: number;
  skillId: string;
  input: string;
  label: string;
  approvalClass: ApprovalClass;
};

export type MarkdownRunbookResult = {
  steps: Array<{
    step: MarkdownRunbookStep;
    result: SkillExecutionResult;
  }>;
  outputText: string;
  summary: string;
};

const skillCatalog = [
  {
    id: "filesystem.list",
    summary: "List files under a safe workspace path.",
  },
  {
    id: "filesystem.read",
    summary: "Read a file from the workspace.",
  },
  {
    id: "git.status",
    summary: "Show repository status.",
  },
  {
    id: "git.diff",
    summary: "Show repository diff output.",
  },
  {
    id: "repo.run-tests",
    summary: "Run repository test command.",
  },
  {
    id: "repo.run-lint",
    summary: "Run repository lint command.",
  },
  {
    id: "usage.report",
    summary: "Render a usage summary.",
  },
  {
    id: "persona.switch",
    summary: "Switch the active persona.",
  },
  {
    id: "mode.switch",
    summary: "Switch the active mode.",
  },
] as const;

export const DEFAULT_SKILLS: SkillDefinition[] = skillCatalog.map((skill) => ({
  ...skill,
  approvalClass: classifySkill(skill.id),
  source: "secretaryos_builtin",
  executor: "secretaryos",
}));

function getDefaultCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CODEX_HOME) {
    return env.CODEX_HOME;
  }

  if (env.HOME) {
    return resolve(env.HOME, ".codex");
  }

  return resolve(".codex");
}

export function getDefaultCodexSkillRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.CODEX_SKILL_ROOT) {
    return resolve(env.CODEX_SKILL_ROOT);
  }

  return resolve(getDefaultCodexHome(env), "skills");
}

export function getManagedCodexImportRoot(
  codexSkillRoot = getDefaultCodexSkillRoot(),
): string {
  return resolve(codexSkillRoot, "secretaryos-imports");
}

export function getManagedCodexPackInstallPath(
  packId: string,
  codexSkillRoot = getDefaultCodexSkillRoot(),
): string {
  return resolve(getManagedCodexImportRoot(codexSkillRoot), packId);
}

function extractSkillSummary(markdown: string): string {
  const rawLines = markdown.split("\n");
  const contentLines =
    rawLines[0]?.trim() === "---"
      ? rawLines.slice(rawLines.indexOf("---", 1) + 1)
      : rawLines;
  const lines = contentLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith("#") && !line.startsWith("```") && line !== "---",
    );

  return lines[0] ?? "Codex skill available to the runtime.";
}

function walkSkillDirectories(rootDir: string): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  const discovered = new Set<string>();

  function visit(currentDir: string) {
    const entries = readdirSync(currentDir, {
      withFileTypes: true,
    });

    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      discovered.add(currentDir);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      visit(join(currentDir, entry.name));
    }
  }

  visit(rootDir);

  return Array.from(discovered);
}

export function listCodexSkillsSync(
  rootDir = getDefaultCodexSkillRoot(),
): SkillDefinition[] {
  return walkSkillDirectories(rootDir)
    .map((skillDir) => {
      const skillPath = join(skillDir, "SKILL.md");
      const skillId = skillDir.split("/").pop() ?? skillDir;
      const relativePath = skillDir.startsWith(rootDir)
        ? skillDir.slice(rootDir.length)
        : skillDir;

      return {
        id: skillId,
        summary: extractSkillSummary(readFileSync(skillPath, "utf8")),
        approvalClass: null,
        source: relativePath.includes("/.system/")
          ? "codex_system"
          : "codex_home",
        executor: "codex",
        path: skillPath,
      } satisfies SkillDefinition;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function listCodexSkills(
  rootDir = getDefaultCodexSkillRoot(),
): Promise<SkillDefinition[]> {
  return listCodexSkillsSync(rootDir);
}

export function listAvailableSkillsSync(
  options: SkillCatalogOptions = {},
): SkillDefinition[] {
  const env = options.env ?? process.env;
  const builtIns = [...DEFAULT_SKILLS];
  const codexSkills = listCodexSkillsSync(
    options.codexSkillRoot ?? getDefaultCodexSkillRoot(env),
  );

  return [...builtIns, ...codexSkills].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export async function listAvailableSkills(
  options: SkillCatalogOptions = {},
): Promise<SkillDefinition[]> {
  return listAvailableSkillsSync(options);
}

function resolveWorkspacePath(cwd: string, targetPath: string): string {
  const resolvedRoot = resolve(cwd);
  const resolvedTarget = resolve(cwd, targetPath || ".");

  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}/`)
  ) {
    throw new Error(
      `Path '${targetPath}' escapes the configured workspace root.`,
    );
  }

  return resolvedTarget;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return [result.stdout, result.stderr].filter(Boolean).join("").trim();
}

export function listSkills(): SkillDefinition[] {
  return listAvailableSkillsSync();
}

async function readSkillPackManifest(
  sourceDir: string,
): Promise<SkillPackManifest> {
  const manifestPath = join(sourceDir, "skill-pack.json");
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as SkillPackManifest;

  if (!manifest.id || !manifest.name || !Array.isArray(manifest.skills)) {
    throw new Error(`Invalid skill pack manifest at ${manifestPath}.`);
  }

  return manifest;
}

function listSkillIdsUnderRoot(rootDir: string): string[] {
  return walkSkillDirectories(rootDir)
    .map((skillDir) => skillDir.split("/").pop() ?? skillDir)
    .sort((left, right) => left.localeCompare(right));
}

function buildImportedSkillPackRecord(
  manifest: SkillPackManifest,
  catalogPath: string,
  codexSkillRoot: string,
): ImportedSkillPackRecord {
  const installedPath = getManagedCodexPackInstallPath(
    manifest.id,
    codexSkillRoot,
  );
  const installed = existsSync(installedPath);

  return {
    ...manifest,
    catalogPath,
    installed,
    installedPath: installed ? installedPath : undefined,
    liveSkillIds: installed ? listSkillIdsUnderRoot(installedPath) : [],
  };
}

export async function installImportedSkillPack(
  sourceDir: string,
  codexSkillRoot = getDefaultCodexSkillRoot(),
): Promise<{
  installedPath: string;
  liveSkillIds: string[];
}> {
  const manifest = await readSkillPackManifest(sourceDir);
  const installedPath = getManagedCodexPackInstallPath(
    manifest.id,
    codexSkillRoot,
  );

  await mkdir(dirname(installedPath), { recursive: true });
  await cp(sourceDir, installedPath, {
    recursive: true,
    force: true,
  });

  return {
    installedPath,
    liveSkillIds: listSkillIdsUnderRoot(installedPath),
  };
}

export async function importSkillPack(
  sourceDir: string,
  targetRoot: string,
  options: SkillPackOptions = {},
): Promise<ImportedSkillPackRecord> {
  const env = options.env ?? process.env;
  const codexSkillRoot =
    options.codexSkillRoot ?? getDefaultCodexSkillRoot(env);
  const manifest = await readSkillPackManifest(sourceDir);
  const catalogPath = join(targetRoot, manifest.id);

  await mkdir(targetRoot, { recursive: true });
  await cp(sourceDir, catalogPath, {
    recursive: true,
    force: true,
  });

  try {
    await installImportedSkillPack(catalogPath, codexSkillRoot);
  } catch (error) {
    await rm(catalogPath, {
      recursive: true,
      force: true,
    });
    throw error;
  }

  return buildImportedSkillPackRecord(manifest, catalogPath, codexSkillRoot);
}

export async function listImportedSkillPacks(
  rootDir: string,
  options: SkillCatalogOptions = {},
): Promise<ImportedSkillPackRecord[]> {
  const env = options.env ?? process.env;
  const codexSkillRoot =
    options.codexSkillRoot ?? getDefaultCodexSkillRoot(env);

  try {
    await mkdir(rootDir, { recursive: true });
  } catch {
    // ignore
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const manifests: ImportedSkillPackRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = join(rootDir, entry.name, "skill-pack.json");
    try {
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as SkillPackManifest;

      if (manifest.id && manifest.name && Array.isArray(manifest.skills)) {
        manifests.push(
          buildImportedSkillPackRecord(
            manifest,
            join(rootDir, entry.name),
            codexSkillRoot,
          ),
        );
      }
    } catch {
      // Ignore directories that are not valid skill packs.
    }
  }

  return manifests;
}

export async function executeSkill(
  skillId: string,
  input: string,
  context: SkillExecutionContext,
): Promise<SkillExecutionResult> {
  const approvalClass = classifySkill(skillId);

  switch (skillId) {
    case "filesystem.list": {
      const targetPath = resolveWorkspacePath(context.cwd, input || ".");
      const entries = await readdir(targetPath, {
        withFileTypes: true,
      });

      return {
        skillId,
        approvalClass,
        outputText: entries
          .map(
            (entry) => `${entry.isDirectory() ? "dir" : "file"} ${entry.name}`,
          )
          .join("\n"),
      };
    }

    case "filesystem.read": {
      const targetPath = resolveWorkspacePath(context.cwd, input);
      const content = await readFile(targetPath, "utf8");

      return {
        skillId,
        approvalClass,
        outputText: content,
      };
    }

    case "git.status": {
      return {
        skillId,
        approvalClass,
        outputText: await runCommand("git", ["status", "--short"], context.cwd),
      };
    }

    case "git.diff": {
      const args = input ? ["diff", "--", input] : ["diff", "--stat"];

      return {
        skillId,
        approvalClass,
        outputText: await runCommand("git", args, context.cwd),
      };
    }

    case "repo.run-tests": {
      return {
        skillId,
        approvalClass,
        outputText: await runCommand("pnpm", ["test"], context.cwd),
      };
    }

    case "repo.run-lint": {
      return {
        skillId,
        approvalClass,
        outputText: await runCommand("pnpm", ["lint"], context.cwd),
      };
    }

    case "usage.report": {
      return {
        skillId,
        approvalClass,
        outputText: context.usageSummary
          ? await context.usageSummary()
          : "Usage summary unavailable.",
      };
    }

    case "persona.switch": {
      if (!input) {
        throw new Error("Persona id is required.");
      }

      return {
        skillId,
        approvalClass,
        outputText: context.updatePersona
          ? await context.updatePersona(input)
          : `Persona switch requested: ${input}`,
      };
    }

    case "mode.switch": {
      if (!input) {
        throw new Error("Mode value is required.");
      }

      return {
        skillId,
        approvalClass,
        outputText: context.updateMode
          ? await context.updateMode(input as Mode)
          : `Mode switch requested: ${input}`,
      };
    }

    default:
      throw new Error(`Unknown skill '${skillId}'.`);
  }
}

export function parseMarkdownRunbook(markdown: string): MarkdownRunbookStep[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, stepIndex) => {
      const match = line.match(/^(?:-|\d+\.)\s+\[(.+?)\]\s*(.*)$/);

      if (!match) {
        throw new Error(`Invalid runbook step format: '${line}'.`);
      }

      const [, skillId, input = ""] = match;

      return {
        id: createId("step"),
        stepIndex,
        skillId,
        input: input.trim(),
        label: line,
        approvalClass: classifySkill(skillId),
      };
    });
}

export async function executeMarkdownRunbook(
  markdown: string,
  context: SkillExecutionContext,
): Promise<MarkdownRunbookResult> {
  const steps = parseMarkdownRunbook(markdown);
  const results: MarkdownRunbookResult["steps"] = [];

  for (const step of steps) {
    results.push({
      step,
      result: await executeSkill(step.skillId, step.input, context),
    });
  }

  return {
    steps: results,
    outputText: results
      .map(
        ({ step, result }) =>
          `Step ${step.stepIndex + 1} (${step.skillId})\n${result.outputText}`,
      )
      .join("\n\n"),
    summary: `Executed ${results.length} runbook step${results.length === 1 ? "" : "s"}.`,
  };
}

export async function createTemporarySkillWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(process.cwd(), "secretary-skills-"));
  await writeFile(
    join(workspace, "README.md"),
    "SecretaryOS skill test workspace.\n",
  );

  return workspace;
}
