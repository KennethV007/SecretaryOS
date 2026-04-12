import assert from "node:assert/strict";
import test from "node:test";

import type { ApprovalRecord, SessionRecord } from "@secretaryos/core";

import type { DiscordApiClient } from "./api-client.js";
import {
  buildDiscordSessionKey,
  handleDiscordMessage,
  handleDiscordSlashCommand,
  isAllowedDiscordUser,
  normalizeDiscordMessage,
  stripBotMention,
} from "./index.js";

function createApiClient(): DiscordApiClient {
  const session: SessionRecord = {
    id: "session_discord",
    userId: "user_local",
    channel: "discord",
    channelSessionKey: "guild:channel",
    activeMode: "assistant",
    activePersonaId: "secretary-default",
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
  const approval: ApprovalRecord = {
    id: "approval_123",
    taskId: "task_approval",
    actionName: "filesystem_reorg",
    reason: "Explicit approval required.",
    requestedInChannel: "discord",
    status: "pending",
    requestedAt: new Date().toISOString(),
  };

  return {
    async ensureSession(input) {
      return {
        ...session,
        channelSessionKey: input.channelSessionKey,
        activeMode: input.mode ?? session.activeMode,
      };
    },
    async sendMessage(input) {
      return {
        session,
        task: {
          id: "task_123",
          sessionId: session.id,
          type: "chat_assistant",
          status: "queued",
          approvalClass: 0,
          input: input.content,
        },
        enqueued: true,
      };
    },
    async listPersonas() {
      return [
        {
          id: "secretary-default",
          slug: "secretary-default",
          name: "Secretary Default",
          packPath: "/tmp/secretary-default",
          profileImageFileName: "avatar.png",
        },
      ];
    },
    async getGlobalActivePersona() {
      return {
        id: "secretary-default",
        slug: "secretary-default",
        name: "Secretary Default",
        packPath: "/tmp/secretary-default",
        profileImageFileName: "avatar.png",
      };
    },
    async setGlobalActivePersona() {
      return {
        id: "secretary-default",
        slug: "secretary-default",
        name: "Secretary Default",
        packPath: "/tmp/secretary-default",
        profileImageFileName: "avatar.png",
      };
    },
    async setActivePersona(sessionId, personaId) {
      return {
        ...session,
        id: sessionId,
        activePersonaId: personaId,
      };
    },
    async getUsageSummary(window) {
      return {
        window,
        requestCount: 4,
        inputTokens: 120,
        outputTokens: 42,
        estimatedCost: 0.12,
      };
    },
    async resolveApproval(approvalId, status) {
      return {
        approval: {
          ...approval,
          id: approvalId,
          status,
        },
        task: {
          id: approval.taskId,
          sessionId: session.id,
          type: "filesystem_reorg",
          status: status === "approved" ? "queued" : "canceled",
          approvalClass: 2,
          input: "Move files",
        },
        enqueued: status === "approved",
      };
    },
  };
}

test("normalizeDiscordMessage builds a Discord session key", () => {
  const normalized = normalizeDiscordMessage({
    channelId: "123",
    guildId: "456",
    authorId: "789",
    messageId: "abc",
    content: "<@123> hello there",
  });

  assert.equal(normalized.channelSessionKey, "456:123");
  assert.equal(normalized.content, "hello there");
});

test("handleDiscordMessage returns an acknowledgement", async () => {
  const reply = await handleDiscordMessage(
    {
      channelId: "123",
      guildId: "456",
      authorId: "789",
      messageId: "abc",
      content: "status update please",
    },
    createApiClient(),
  );

  assert.match(reply?.content ?? "", /Queued/);
});

test("handleDiscordSlashCommand supports mode, usage, and approval actions", async () => {
  const apiClient = createApiClient();

  const modeReply = await handleDiscordSlashCommand(
    {
      name: "mode",
      channelId: "123",
      guildId: "456",
      userId: "789",
      options: {
        mode: "planner",
      },
    },
    apiClient,
  );

  assert.match(modeReply.content, /planner/);

  const usageReply = await handleDiscordSlashCommand(
    {
      name: "usage",
      channelId: "123",
      guildId: "456",
      userId: "789",
      options: {
        window: "today",
      },
    },
    apiClient,
  );

  assert.match(usageReply.content, /Requests: 4/);

  const approvalReply = await handleDiscordSlashCommand(
    {
      name: "approve",
      channelId: "123",
      guildId: "456",
      userId: "789",
      options: {
        approvalId: "approval_123",
      },
    },
    apiClient,
  );

  assert.match(approvalReply.content, /approved/);
});

test("session key and allow-list helpers behave deterministically", () => {
  assert.equal(buildDiscordSessionKey({ channelId: "1" }), "dm:1");
  assert.equal(stripBotMention("<@999> hello"), "hello");
  assert.equal(isAllowedDiscordUser("u1", []), true);
  assert.equal(isAllowedDiscordUser("u1", ["u2"]), false);
});
