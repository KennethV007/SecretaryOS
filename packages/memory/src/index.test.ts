import assert from "node:assert/strict";
import test from "node:test";

import {
  MemPalaceCliClient,
  type MemoryClient,
  parseCommandArgs,
  retrieveMemoryContext,
} from "./index.js";

test("MemPalaceCliClient search uses the documented CLI search command", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const client = new MemPalaceCliClient(
    "mempalace",
    ["-m", "mempalace"],
    async (command, args) => {
      commands.push({ command, args });

      return {
        stdout: "memory line one\nmemory line two\n",
        stderr: "",
      };
    },
  );

  const result = await client.search({
    text: "database configuration",
    scope: "project",
    projectId: "work",
  });

  assert.deepEqual(commands[0], {
    command: "mempalace",
    args: [
      "-m",
      "mempalace",
      "search",
      "database configuration",
      "--wing=work",
    ],
  });
  assert.equal(result.results.length, 2);
});

test("MemPalaceCliClient ingests exports through mine conversations", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const client = new MemPalaceCliClient(
    "mempalace",
    ["-m", "mempalace"],
    async (command, args) => {
      commands.push({ command, args });

      return {
        stdout: "imported",
        stderr: "",
      };
    },
  );

  const result = await client.ingestConversationExport("./export.json");

  assert.deepEqual(commands[0], {
    command: "mempalace",
    args: ["-m", "mempalace", "mine", "conversations", "./export.json"],
  });
  assert.equal(result.stdout, "imported");
});

test("MemPalaceCliClient status reports unavailable when the command fails", async () => {
  const client = new MemPalaceCliClient("mempalace", [], async () => {
    throw new Error("missing binary");
  });

  const status = await client.status();

  assert.equal(status.available, false);
});

test("parseCommandArgs splits whitespace-delimited arguments", () => {
  assert.deepEqual(parseCommandArgs("-m mempalace --help"), [
    "-m",
    "mempalace",
    "--help",
  ]);
});

test("retrieveMemoryContext merges structured and semantic memories", async () => {
  const client: MemoryClient = {
    async search() {
      return {
        query: "terse replies",
        results: [
          { content: "User prefers terse replies." },
          { content: "Project note: use pnpm in this repository." },
        ],
        rawOutput:
          "User prefers terse replies.\nProject note: use pnpm in this repository.",
      };
    },
    async ingestConversationExport(sourcePath: string) {
      return {
        sourcePath,
        stdout: "",
        stderr: "",
      };
    },
    async status() {
      return {
        available: true,
      };
    },
  };

  const result = await retrieveMemoryContext(client, {
    text: "What is my preference for terse replies?",
    scope: "global",
    mode: "assistant",
    structuredMemories: [
      {
        id: "memory_1",
        kind: "preference",
        scope: "global",
        source: "codex_task",
        content: "User prefers terse replies.",
        summary: "User prefers terse replies.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "memory_2",
        kind: "project",
        scope: "project",
        source: "codex_task",
        content: "Project note: use pnpm in this repository.",
        summary: "Project note: use pnpm in this repository.",
        projectId: "work",
        createdAt: new Date().toISOString(),
      },
    ],
    limit: 4,
  });

  assert.match(result.text ?? "", /Structured facts:/);
  assert.match(result.text ?? "", /MemPalace recall:/);
  assert.match(result.text ?? "", /User prefers terse replies\./);
  assert.match(
    result.text ?? "",
    /Project note: use pnpm in this repository\./,
  );
});
