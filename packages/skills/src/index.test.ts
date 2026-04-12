import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createTemporarySkillWorkspace,
  executeMarkdownRunbook,
  executeSkill,
  importSkillPack,
  listImportedSkillPacks,
  listSkills,
  parseMarkdownRunbook,
} from "./index.js";

test("listSkills exposes the built-in registry", () => {
  const skills = listSkills();

  assert.ok(skills.find((skill) => skill.id === "filesystem.list"));
  assert.ok(skills.find((skill) => skill.id === "mode.switch"));
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

  await mkdir(sourceDir, { recursive: true });
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

  const manifest = await importSkillPack(sourceDir, targetRoot);
  const packs = await listImportedSkillPacks(targetRoot);

  assert.equal(manifest.id, "local-pack");
  assert.equal(packs[0]?.name, "Local Pack");

  await rm(workspace, {
    recursive: true,
    force: true,
  });
});
