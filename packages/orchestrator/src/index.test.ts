import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SecretaryOrchestrator, createInMemoryRuntimeState } from "./index.js";

test("planner sessions keep the default persona by default", () => {
  const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState());
  const session = runtime.createSession({
    channel: "dashboard",
    channelSessionKey: "planner-channel",
    userName: "Local User",
    mode: "planner",
  });

  assert.equal(session.activeMode, "planner");
  assert.equal(session.activePersonaId, "secretary-default");
});

test("persona creation persists into a temp pack root", () => {
  const personaPackRoot = mkdtempSync(join(tmpdir(), "secretary-personas-"));
  const runtime = new SecretaryOrchestrator(
    createInMemoryRuntimeState({ personaPackRoot }),
  );

  const persona = runtime.createPersona({
    slug: "night-operator",
    name: "Night Operator",
    description: "A calm after-hours presence.",
    basePrompt: "Be concise and steady.",
    fullPrompt: "Be fully conversational and calm.",
    definitionMarkdown: "# Night Operator\n\nA calm after-hours presence.",
    traits: ["calm"],
    formattingPreferences: ["concise"],
    voice: "steady",
  });

  assert.equal(persona.slug, "night-operator");
  assert.equal(runtime.getPersona(persona.id).name, "Night Operator");
});

test("after-hours memory writes stay in the isolated scope", async () => {
  const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState());
  const session = runtime.createSession({
    channel: "discord",
    channelSessionKey: "after-hours-thread",
    userName: "Local User",
    mode: "after_hours",
  });
  const taskResult = await runtime.createTask({
    sessionId: session.id,
    channel: "discord",
    content: "Talk about the evening playlist.",
    mode: "after_hours",
    taskType: "after_hours_chat",
  });

  runtime.recordMemoryWrite({
    kind: "memory.write",
    taskId: taskResult.task.id,
    content: "User likes ambient techno after 10pm.",
    scope: "after_hours_only",
    requestedAt: new Date().toISOString(),
  });

  assert.equal(runtime.listMemory().length, 1);
  assert.equal(runtime.listMemory({ scope: "after_hours_only" }).length, 1);
  assert.equal(runtime.listMemory({ scope: "global" }).length, 0);
});

test("global active persona persists and becomes the default for new tasks", async () => {
  const personaPackRoot = mkdtempSync(join(tmpdir(), "secretary-personas-"));
  const activePersonaStorePath = join(personaPackRoot, "active-character.json");
  const runtime = new SecretaryOrchestrator(
    createInMemoryRuntimeState({
      personaPackRoot,
      activePersonaStorePath,
    }),
  );

  const persona = runtime.createPersona({
    slug: "night-operator",
    name: "Night Operator",
    description: "A calm after-hours presence.",
    basePrompt: "Be concise and steady.",
    fullPrompt: "Be fully conversational and calm.",
    definitionMarkdown: "# Night Operator\n\nA calm after-hours presence.",
    traits: ["calm"],
    formattingPreferences: ["concise"],
    voice: "steady",
  });

  runtime.setGlobalActivePersona(persona.id);

  const session = runtime.createSession({
    channel: "discord",
    channelSessionKey: "global-character",
    userName: "Local User",
  });
  const task = await runtime.createTask({
    sessionId: session.id,
    channel: "discord",
    content: "Say hello.",
  });

  assert.equal(session.activePersonaId, persona.id);
  assert.equal(task.task.personaId, persona.id);
  assert.equal(runtime.getActivePersona().id, persona.id);
  assert.equal(existsSync(activePersonaStorePath), true);
  assert.match(
    readFileSync(activePersonaStorePath, "utf8"),
    new RegExp(persona.id),
  );
});

test("session messages are retained and packed into subsequent task input", async () => {
  const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState());
  const session = runtime.createSession({
    channel: "dashboard",
    channelSessionKey: "chat-context",
    userName: "Local User",
  });

  await runtime.receiveMessage({
    channel: "dashboard",
    channelSessionKey: "chat-context",
    content: "Remember my preference for terse replies.",
  });

  const messages = runtime.listSessionMessages(session.id);
  const task = await runtime.createTask({
    sessionId: session.id,
    channel: "dashboard",
    content: "What did I ask you to remember?",
  });

  assert.ok(messages.some((message) => message.role === "user"));
  assert.match(task.task.input, /Conversation context:/);
});
