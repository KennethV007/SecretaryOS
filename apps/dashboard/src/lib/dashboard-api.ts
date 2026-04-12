import type {
  ApprovalRecord,
  CreateMessageInput,
  EvalRun,
  Experiment,
  ExperimentResult,
  ImprovementCandidate,
  MemoryRecord,
  PolicyVersion,
  PromptVersion,
  ReplayCase,
  SessionMessageRecord,
  SessionRecord,
  TaskRecord,
  UsageWindow,
} from "@secretaryos/core";
import type { PersonaDefinition } from "@secretaryos/personas";

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
  stats?: {
    sessions: number;
    tasks: number;
    approvalsPending: number;
  };
};

type ListResponse<T> = {
  items: T[];
};

type UsageSummary = {
  window: UsageWindow;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

export type SkillDefinition = {
  id: string;
  summary: string;
  approvalClass: number;
};

export type SkillPackManifest = {
  id: string;
  name: string;
  summary?: string;
  skills: SkillDefinition[];
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return fallback;
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getHealthSnapshot(): Promise<HealthResponse> {
  return fetchJson("/health", {
    status: "offline",
    service: "api",
    timestamp: new Date().toISOString(),
    stats: {
      sessions: 0,
      tasks: 0,
      approvalsPending: 0,
    },
  });
}

export async function getTasks(): Promise<TaskRecord[]> {
  const response = await fetchJson<ListResponse<TaskRecord>>("/tasks", {
    items: [],
  });

  return response.items;
}

export async function getApprovals(): Promise<ApprovalRecord[]> {
  const response = await fetchJson<ListResponse<ApprovalRecord>>("/approvals", {
    items: [],
  });

  return response.items;
}

export async function getPersonas(): Promise<PersonaDefinition[]> {
  const response = await fetchJson<ListResponse<PersonaDefinition>>(
    "/personas",
    {
      items: [],
    },
  );

  return response.items;
}

export async function createPersona(
  formData: FormData,
): Promise<PersonaDefinition> {
  const response = await fetch(`${apiBaseUrl}/personas`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to create persona.");
  }

  return (await response.json()) as PersonaDefinition;
}

export async function getReplayCases(): Promise<ReplayCase[]> {
  const response = await fetchJson<ListResponse<ReplayCase>>("/replays", {
    items: [],
  });

  return response.items;
}

export async function getEvalRuns(): Promise<EvalRun[]> {
  const response = await fetchJson<ListResponse<EvalRun>>("/evals", {
    items: [],
  });

  return response.items;
}

export async function getImprovementCandidates(): Promise<
  ImprovementCandidate[]
> {
  const response = await fetchJson<ListResponse<ImprovementCandidate>>(
    "/improvement/candidates",
    {
      items: [],
    },
  );

  return response.items;
}

export async function getExperiments(): Promise<Experiment[]> {
  const response = await fetchJson<ListResponse<Experiment>>("/experiments", {
    items: [],
  });

  return response.items;
}

export async function getExperimentResults(): Promise<ExperimentResult[]> {
  const response = await fetchJson<ListResponse<ExperimentResult>>(
    "/experiment-results",
    {
      items: [],
    },
  );

  return response.items;
}

export async function getPromptVersions(): Promise<PromptVersion[]> {
  const response = await fetchJson<ListResponse<PromptVersion>>(
    "/prompt-versions",
    {
      items: [],
    },
  );

  return response.items;
}

export async function getPolicyVersions(): Promise<PolicyVersion[]> {
  const response = await fetchJson<ListResponse<PolicyVersion>>(
    "/policy-versions",
    {
      items: [],
    },
  );

  return response.items;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  return fetchJson("/usage/summary?window=today", {
    window: "today",
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  });
}

export async function getSkills(): Promise<SkillDefinition[]> {
  const response = await fetchJson<ListResponse<SkillDefinition>>("/skills", {
    items: [],
  });

  return response.items;
}

export async function getSkillPacks(): Promise<SkillPackManifest[]> {
  const response = await fetchJson<ListResponse<SkillPackManifest>>(
    "/skills/packs",
    {
      items: [],
    },
  );

  return response.items;
}

export async function importSkillPack(
  sourceDir: string,
): Promise<SkillPackManifest> {
  const response = await fetch(`${apiBaseUrl}/skills/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourceDir }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to import skill pack.");
  }

  return (await response.json()) as SkillPackManifest;
}

export async function getMemoryItems(): Promise<MemoryRecord[]> {
  const response = await fetchJson<ListResponse<MemoryRecord>>("/memory", {
    items: [],
  });

  return response.items;
}

export async function getSessions(): Promise<SessionRecord[]> {
  const response = await fetchJson<ListResponse<SessionRecord>>("/sessions", {
    items: [],
  });

  return response.items;
}

export async function getSessionMessages(
  sessionId: string,
): Promise<SessionMessageRecord[]> {
  const response = await fetchJson<ListResponse<SessionMessageRecord>>(
    `/sessions/${sessionId}/messages`,
    {
      items: [],
    },
  );

  return response.items;
}

export async function createSession(payload: {
  channel: SessionRecord["channel"];
  channelSessionKey: string;
  mode?: SessionRecord["activeMode"];
  personaId?: SessionRecord["activePersonaId"];
}): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to create session.");
  }

  return (await response.json()) as SessionRecord;
}

export async function sendMessage(
  payload: CreateMessageInput,
): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to send message.");
  }

  return response.json();
}

export async function getTask(taskId: string): Promise<TaskRecord> {
  const response = await fetch(`${apiBaseUrl}/tasks/${taskId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load task ${taskId}.`);
  }

  return (await response.json()) as TaskRecord;
}
