import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createTemporarySkillWorkspace,
  executeMarkdownRunbook,
  executeSkill,
  getDefaultCodexSkillRoot,
  getManagedCodexPackInstallPath,
  importSkillPack,
  installImportedSkillPack,
  listAvailableSkillsSync,
  listCodexSkillsSync,
  listImportedSkillPacks,
  listSkills,
  parseMarkdownRunbook,
} from "./index.js";

test("listSkills exposes the built-in registry", () => {
  const skills = listSkills();

  assert.ok(skills.find((skill) => skill.id === "filesystem.list"));
  assert.ok(skills.find((skill) => skill.id === "mode.switch"));
});

test("listCodexSkillsSync discovers installed Codex skills", async () => {
  const workspace = await createTemporarySkillWorkspace();
  const codexRoot = join(workspace, ".codex", "skills");
  const systemSkillDir = join(codexRoot, ".system", "imagegen");
  const userSkillDir = join(codexRoot, "repo-helper");

  await mkdir(systemSkillDir, { recursive: true });
  await mkdir(userSkillDir, { recursive: true });
  await writeFile(
    join(systemSkillDir, "SKILL.md"),
    "# imagegen\nGenerate or edit raster images.\n",
  );
  await writeFile(
    join(userSkillDir, "SKILL.md"),
    "# repo-helper\nRepository helper skill.\n",
  );

  const skills = listCodexSkillsSync(codexRoot);

  assert.equal(skills.length, 2);
  assert.deepEqual(
    skills.map((skill) => ({
      id: skill.id,
      source: skill.source,
      executor: skill.executor,
    })),
    [
      {
        id: "imagegen",
        source: "codex_system",
        executor: "codex",
      },
      {
        id: "repo-helper",
        source: "codex_home",
        executor: "codex",
      },
    ],
  );

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});

test("listAvailableSkillsSync merges built-ins with installed Codex skills", async () => {
  const workspace = await createTemporarySkillWorkspace();
  const codexRoot = getDefaultCodexSkillRoot({
    HOME: workspace,
  });

  await mkdir(join(codexRoot, "custom-helper"), { recursive: true });
  await writeFile(
    join(codexRoot, "custom-helper", "SKILL.md"),
    "# custom-helper\nHelp with custom tasks.\n",
  );

  const skills = listAvailableSkillsSync({
    env: {
      HOME: workspace,
    },
  });

  assert.ok(skills.find((skill) => skill.id === "filesystem.list"));
  assert.ok(skills.find((skill) => skill.id === "custom-helper"));

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});

test("filesystem skills operate within the configured workspace", async () => {
  const workspace = await createTemporarySkillWorkspace();
  const nestedDir = join(workspace, "docs");
  const nestedFile = join(nestedDir, "plan.md");

  await mkdir(nestedDir, {
    recursive: true,
  });
  await writeFile(nestedFile, "# Plan\n");

  const listed = await executeSkill("filesystem.list", "docs", {
    cwd: workspace,
  });
  const read = await executeSkill("filesystem.read", "docs/plan.md", {
    cwd: workspace,
  });

  assert.match(listed.outputText, /plan.md/);
  assert.equal(read.outputText, await readFile(nestedFile, "utf8"));

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});

test("parseMarkdownRunbook preserves step order", () => {
  const steps = parseMarkdownRunbook(`
- [filesystem.list] .
- [mode.switch] planner
  `);

  assert.equal(steps.length, 2);
  assert.equal(steps[0]?.skillId, "filesystem.list");
  assert.equal(steps[1]?.skillId, "mode.switch");
});

test("executeMarkdownRunbook runs steps sequentially", async () => {
  const workspace = await createTemporarySkillWorkspace();
  const updates: string[] = [];

  const result = await executeMarkdownRunbook(
    `
- [mode.switch] planner
- [filesystem.read] README.md
    `,
    {
      cwd: workspace,
      updateMode(mode) {
        updates.push(mode);

        return `Mode switched to ${mode}`;
      },
    },
  );

  assert.equal(updates[0], "planner");
  assert.match(result.outputText, /Mode switched to planner/);
  assert.match(result.outputText, /SecretaryOS skill test workspace/);

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});

test("importSkillPack copies a local pack into the library root", async () => {
  const workspace = await createTemporarySkillWorkspace();
  const sourceDir = join(workspace, "pack-source");
  const targetRoot = join(workspace, "packs");
  const codexHome = join(workspace, ".codex-home");
  const codexSkillRoot = getDefaultCodexSkillRoot({
    CODEX_HOME: codexHome,
  });

  await mkdir(sourceDir, { recursive: true });
  await mkdir(join(sourceDir, "helper-skill"), { recursive: true });
  await writeFile(
    join(sourceDir, "skill-pack.json"),
    JSON.stringify(
      {
        id: "local-pack",
        name: "Local Pack",
        skills: [
          {
            id: "filesystem.list",
            summary: "List files.",
            approvalClass: 0,
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(sourceDir, "helper-skill", "SKILL.md"),
    "# helper-skill\nHelper skill.\n",
  );

  const manifest = await importSkillPack(sourceDir, targetRoot, {
    codexSkillRoot,
  });
  const packs = await listImportedSkillPacks(targetRoot, {
    codexSkillRoot,
  });

  assert.equal(manifest.id, "local-pack");
  assert.equal(manifest.installed, true);
  assert.equal(
    manifest.installedPath,
    getManagedCodexPackInstallPath("local-pack", codexSkillRoot),
  );
  assert.deepEqual(manifest.liveSkillIds, ["helper-skill"]);
  assert.equal(packs[0]?.name, "Local Pack");
  assert.equal(packs[0]?.installed, true);

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});

test("installImportedSkillPack installs a pack into the managed Codex skill root", async () => {
  const workspace = await createTemporarySkillWorkspace();
  const sourceDir = join(workspace, "codex-pack");
  const codexSkillRoot = join(workspace, ".codex", "skills");

  await mkdir(join(sourceDir, "custom-skill"), { recursive: true });
  await writeFile(
    join(sourceDir, "skill-pack.json"),
    JSON.stringify(
      {
        id: "codex-pack",
        name: "Codex Pack",
        skills: [
          {
            id: "custom-skill",
            summary: "Custom skill.",
            approvalClass: 0,
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(sourceDir, "custom-skill", "SKILL.md"),
    "# custom-skill\nCustom skill.\n",
  );

  const installation = await installImportedSkillPack(
    sourceDir,
    codexSkillRoot,
  );

  assert.equal(
    installation.installedPath,
    getManagedCodexPackInstallPath("codex-pack", codexSkillRoot),
  );
  assert.deepEqual(installation.liveSkillIds, ["custom-skill"]);

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});
