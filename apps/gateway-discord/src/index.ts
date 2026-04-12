import type {
  ApprovalRecord,
  CreateMessageInput,
  Mode,
  SessionRecord,
  UsageWindow,
} from "@secretaryos/core";

import type { DiscordApiClient, GatewayMessageResult } from "./api-client.js";

export type DiscordInboundMessage = {
  channelId: string;
  guildId?: string;
  authorId: string;
  messageId: string;
  content: string;
};

export type DiscordSlashCommandName =
  | "mode"
  | "persona"
  | "usage"
  | "approve"
  | "deny";

export type DiscordSlashCommand = {
  name: DiscordSlashCommandName;
  channelId: string;
  guildId?: string;
  userId: string;
  options: Record<string, string | undefined>;
};

export type GatewayReply = {
  content: string;
  ephemeral?: boolean;
};

export function buildDiscordSessionKey(input: {
  guildId?: string;
  channelId: string;
}): string {
  return `${input.guildId ?? "dm"}:${input.channelId}`;
}

export function stripBotMention(content: string): string {
  return content.replace(/^<@!?\d+>\s*/, "").trim();
}

export function normalizeDiscordMessage(
  message: DiscordInboundMessage,
): CreateMessageInput {
  return {
    channel: "discord",
    channelSessionKey: buildDiscordSessionKey(message),
    content: stripBotMention(message.content),
    projectId: message.guildId,
  };
}

export function isAllowedDiscordUser(
  userId: string,
  allowedUserIds: string[],
): boolean {
  return allowedUserIds.length === 0 || allowedUserIds.includes(userId);
}

function formatTaskAcknowledgement(result: GatewayMessageResult): string {
  if (result.approval) {
    return `Approval required for \`${result.task.type}\` as \`${result.task.id}\`. Approval id: \`${result.approval.id}\`.`;
  }

  return `Queued \`${result.task.type}\` as \`${result.task.id}\` with status \`${result.task.status}\`.`;
}

function formatUsageSummary(summary: {
  window: UsageWindow;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}): string {
  return [
    `Window: ${summary.window}`,
    `Requests: ${summary.requestCount}`,
    `Tokens: ${summary.inputTokens} in / ${summary.outputTokens} out`,
    `Estimated cost: $${summary.estimatedCost.toFixed(2)}`,
  ].join("\n");
}

async function ensureDiscordSession(
  apiClient: DiscordApiClient,
  input: {
    channelId: string;
    guildId?: string;
    mode?: Mode;
  },
): Promise<SessionRecord> {
  return apiClient.ensureSession({
    channel: "discord",
    channelSessionKey: buildDiscordSessionKey(input),
    userName: "Discord User",
    mode: input.mode,
  });
}

export async function handleDiscordMessage(
  message: DiscordInboundMessage,
  apiClient: DiscordApiClient,
): Promise<GatewayReply | undefined> {
  const normalized = normalizeDiscordMessage(message);

  if (!normalized.content) {
    return undefined;
  }

  const result = await apiClient.sendMessage(normalized);

  return {
    content: formatTaskAcknowledgement(result),
  };
}

export async function handleDiscordSlashCommand(
  command: DiscordSlashCommand,
  apiClient: DiscordApiClient,
): Promise<GatewayReply> {
  switch (command.name) {
    case "mode": {
      const requestedMode = command.options.mode as Mode | undefined;

      if (!requestedMode) {
        return {
          content: "Mode is required.",
          ephemeral: true,
        };
      }

      const session = await ensureDiscordSession(apiClient, {
        channelId: command.channelId,
        guildId: command.guildId,
        mode: requestedMode,
      });

      return {
        content: `Mode set to \`${session.activeMode}\` for this channel.`,
        ephemeral: true,
      };
    }

    case "persona": {
      const personaId = command.options.persona;

      if (!personaId) {
        return {
          content: "Persona id is required.",
          ephemeral: true,
        };
      }

      const session = await ensureDiscordSession(apiClient, {
        channelId: command.channelId,
        guildId: command.guildId,
      });
      const updatedSession = await apiClient.setActivePersona(
        session.id,
        personaId,
      );

      return {
        content: `Persona set to \`${updatedSession.activePersonaId}\`.`,
        ephemeral: true,
      };
    }

    case "usage": {
      const window =
        (command.options.window as UsageWindow | undefined) ?? "today";
      const summary = await apiClient.getUsageSummary(window);

      return {
        content: formatUsageSummary(summary),
        ephemeral: true,
      };
    }

    case "approve":
    case "deny": {
      const approvalId = command.options.approvalId;

      if (!approvalId) {
        return {
          content: "Approval id is required.",
          ephemeral: true,
        };
      }

      const resolution = await apiClient.resolveApproval(
        approvalId,
        command.name === "approve" ? "approved" : "denied",
      );

      return {
        content: `Approval \`${resolution.approval.id}\` is now \`${resolution.approval.status}\` for task \`${resolution.task.id}\`.`,
        ephemeral: true,
      };
    }
  }
}

export function formatApprovalSummary(approval: ApprovalRecord): string {
  return `${approval.actionName}: ${approval.reason} (${approval.status})`;
}
