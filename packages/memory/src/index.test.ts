import assert from "node:assert/strict";
import test from "node:test";

import { MemPalaceCliClient, parseCommandArgs } from "./index.js";

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
