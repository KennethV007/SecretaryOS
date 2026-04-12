import type {
  ApprovalRecord,
  CreateMessageInput,
  CreateSessionInput,
  ResolveApprovalInput,
  SessionRecord,
  TaskRecord,
  UsageWindow,
} from "@secretaryos/core";
import { z } from "zod";

const GatewayPersonaSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  packPath: z.string().min(1),
  profileImageFileName: z.string().optional(),
});

export type GatewayPersona = z.infer<typeof GatewayPersonaSchema>;

export type GatewayMessageResult = {
  session: SessionRecord;
  task: TaskRecord;
  approval?: ApprovalRecord;
  enqueued: boolean;
};

export type DiscordApiClient = {
  ensureSession(input: CreateSessionInput): Promise<SessionRecord>;
  sendMessage(input: CreateMessageInput): Promise<GatewayMessageResult>;
  listPersonas(): Promise<GatewayPersona[]>;
  getGlobalActivePersona(): Promise<GatewayPersona>;
  setGlobalActivePersona(personaId: string): Promise<GatewayPersona>;
  setActivePersona(
    sessionId: string,
    personaId: string,
  ): Promise<SessionRecord>;
  getUsageSummary(window: UsageWindow): Promise<{
    window: UsageWindow;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }>;
  resolveApproval(
    approvalId: string,
    status: ResolveApprovalInput["status"],
  ): Promise<{
    approval: ApprovalRecord;
    task: TaskRecord;
    enqueued: boolean;
  }>;
};

type ApiClientConfig = {
  apiBaseUrl: string;
};

async function fetchJson<T>(
  config: ApiClientConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(
      `Discord gateway API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

export function createDiscordApiClient(
  config: ApiClientConfig,
): DiscordApiClient {
  return {
    ensureSession(input) {
      return fetchJson(config, "/sessions", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    sendMessage(input) {
      return fetchJson(config, "/messages", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async listPersonas() {
      const response = await fetchJson<{ items: GatewayPersona[] }>(
        config,
        "/personas",
      );

      return response.items.map((persona) =>
        GatewayPersonaSchema.parse(persona),
      );
    },
    async getGlobalActivePersona() {
      const response = await fetchJson(config, "/personas/global-active");
      return GatewayPersonaSchema.parse(response);
    },
    async setGlobalActivePersona(personaId) {
      const response = await fetchJson(config, "/personas/global-active", {
        method: "POST",
        body: JSON.stringify({
          personaId,
        }),
      });

      return GatewayPersonaSchema.parse(response);
    },
    setActivePersona(sessionId, personaId) {
      return fetchJson(config, "/personas/active", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          personaId,
        }),
      });
    },
    getUsageSummary(window) {
      return fetchJson(config, `/usage/summary?window=${window}`);
    },
    resolveApproval(approvalId, status) {
      return fetchJson(config, `/approvals/${approvalId}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          status,
        }),
      });
    },
  };
}
