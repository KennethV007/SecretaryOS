import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import type { ApprovalClass, Mode } from "@secretaryos/core";
import { createId } from "@secretaryos/core";
import { classifySkill } from "@secretaryos/policy";

const execFileAsync = promisify(execFile);

export type SkillDefinition = {
  id: string;
  summary: string;
  approvalClass: ApprovalClass;
};

export type SkillPackManifest = {
  id: string;
  name: string;
  summary?: string;
  skills: SkillDefinition[];
};

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
}));

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
  return DEFAULT_SKILLS;
}

export async function importSkillPack(
  sourceDir: string,
  targetRoot: string,
): Promise<SkillPackManifest> {
  const manifestPath = join(sourceDir, "skill-pack.json");
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as SkillPackManifest;

  if (!manifest.id || !manifest.name || !Array.isArray(manifest.skills)) {
    throw new Error(`Invalid skill pack manifest at ${manifestPath}.`);
  }

  await mkdir(targetRoot, { recursive: true });
  await cp(sourceDir, join(targetRoot, manifest.id), {
    recursive: true,
    force: true,
  });

  return manifest;
}

export async function listImportedSkillPacks(
  rootDir: string,
): Promise<SkillPackManifest[]> {
  try {
    await mkdir(rootDir, { recursive: true });
  } catch {
    // ignore
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const manifests: SkillPackManifest[] = [];

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
        manifests.push(manifest);
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
