import {
  type ApprovalRecord,
  type ApprovalStatus,
  type CreateSessionInput,
  type CreateTaskInput,
  DEFAULT_MODE,
  type SessionRecord,
  type TaskRecord,
  type TaskStatus,
  type UsageRecord,
  type UsageWindow,
  createId,
} from "@secretaryos/core";
import { routeTurn } from "@secretaryos/orchestrator";
import {
  DEFAULT_PERSONA_ID,
  PERSONAS,
  type PersonaDefinition,
} from "@secretaryos/personas";
import { classifyWorkflow } from "@secretaryos/policy";

const DEFAULT_USER_ID = "user_local";

export class StoreError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export type UsageSummary = {
  window: UsageWindow;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

export type CreateTaskResult = {
  task: TaskRecord;
  approval?: ApprovalRecord;
};

export type ApiStore = ReturnType<typeof createApiStore>;

export function createApiStore() {
  const sessions = new Map<string, SessionRecord>();
  const tasks = new Map<string, TaskRecord>();
  const approvals = new Map<string, ApprovalRecord>();
  const usageRecords: UsageRecord[] = [];
  const personas = new Map(PERSONAS.map((persona) => [persona.id, persona]));

  function now() {
    return new Date().toISOString();
  }

  function getPersonaOrThrow(personaId: string): PersonaDefinition {
    const persona = personas.get(personaId);

    if (!persona) {
      throw new StoreError(404, `Persona '${personaId}' was not found.`);
    }

    return persona;
  }

  function getSessionOrThrow(sessionId: string): SessionRecord {
    const session = sessions.get(sessionId);

    if (!session) {
      throw new StoreError(404, `Session '${sessionId}' was not found.`);
    }

    return session;
  }

  function getTaskOrThrow(taskId: string): TaskRecord {
    const task = tasks.get(taskId);

    if (!task) {
      throw new StoreError(404, `Task '${taskId}' was not found.`);
    }

    return task;
  }

  function getApprovalOrThrow(approvalId: string): ApprovalRecord {
    const approval = approvals.get(approvalId);

    if (!approval) {
      throw new StoreError(404, `Approval '${approvalId}' was not found.`);
    }

    return approval;
  }

  return {
    getStats() {
      return {
        sessions: sessions.size,
        tasks: tasks.size,
        approvalsPending: Array.from(approvals.values()).filter(
          (approval) => approval.status === "pending",
        ).length,
      };
    },

    createSession(input: CreateSessionInput): SessionRecord {
      getPersonaOrThrow(input.personaId ?? DEFAULT_PERSONA_ID);

      const existing = Array.from(sessions.values()).find(
        (session) =>
          session.channel === input.channel &&
          session.channelSessionKey === input.channelSessionKey,
      );

      if (existing) {
        return existing;
      }

      const timestamp = now();
      const session: SessionRecord = {
        id: createId("session"),
        userId: DEFAULT_USER_ID,
        channel: input.channel,
        channelSessionKey: input.channelSessionKey,
        activeMode: input.mode ?? DEFAULT_MODE,
        activePersonaId: input.personaId ?? DEFAULT_PERSONA_ID,
        createdAt: timestamp,
        lastActiveAt: timestamp,
      };

      sessions.set(session.id, session);

      return session;
    },

    getSession(sessionId: string): SessionRecord {
      return getSessionOrThrow(sessionId);
    },

    updateSession(
      sessionId: string,
      input: Partial<Pick<SessionRecord, "activeMode" | "activePersonaId">>,
    ): SessionRecord {
      const session = getSessionOrThrow(sessionId);

      if (input.activePersonaId) {
        getPersonaOrThrow(input.activePersonaId);
      }

      const nextSession: SessionRecord = {
        ...session,
        activeMode: input.activeMode ?? session.activeMode,
        activePersonaId: input.activePersonaId ?? session.activePersonaId,
        lastActiveAt: now(),
      };

      sessions.set(nextSession.id, nextSession);

      return nextSession;
    },

    listTasks(status?: TaskStatus): TaskRecord[] {
      return Array.from(tasks.values()).filter((task) =>
        status ? task.status === status : true,
      );
    },

    createTask(input: CreateTaskInput): CreateTaskResult {
      const session = getSessionOrThrow(input.sessionId);
      const routed = routeTurn({
        sessionId: input.sessionId,
        channel: input.channel,
        content: input.content,
        mode: input.mode ?? session.activeMode,
        personaId: input.personaId ?? session.activePersonaId,
        projectId: input.projectId,
      });

      let task: TaskRecord = {
        ...routed.task,
        mode: input.mode ?? session.activeMode,
        personaId: input.personaId ?? session.activePersonaId,
      };

      if (input.taskType && input.taskType !== task.type) {
        task = {
          ...task,
          type: input.taskType,
          approvalClass: classifyWorkflow(input.taskType),
        };
      }

      let approval: ApprovalRecord | undefined;

      if (task.approvalClass >= 2) {
        approval = {
          id: createId("approval"),
          taskId: task.id,
          actionName: task.type,
          reason: "This task requires explicit approval before execution.",
          requestedInChannel: session.channel,
          status: "pending",
          requestedAt: now(),
        };

        task = {
          ...task,
          status: "awaiting_approval",
        };

        approvals.set(approval.id, approval);
      }

      tasks.set(task.id, task);
      sessions.set(session.id, {
        ...session,
        lastActiveAt: now(),
      });

      return {
        task,
        approval,
      };
    },

    getTask(taskId: string): TaskRecord {
      return getTaskOrThrow(taskId);
    },

    listApprovals(status?: ApprovalStatus): ApprovalRecord[] {
      return Array.from(approvals.values()).filter((approval) =>
        status ? approval.status === status : true,
      );
    },

    resolveApproval(
      approvalId: string,
      status: "approved" | "denied",
    ): ApprovalRecord {
      const approval = getApprovalOrThrow(approvalId);

      const nextApproval: ApprovalRecord = {
        ...approval,
        status,
        resolvedAt: now(),
      };

      approvals.set(nextApproval.id, nextApproval);

      const task = getTaskOrThrow(approval.taskId);

      tasks.set(task.id, {
        ...task,
        status: status === "approved" ? "queued" : "canceled",
      });

      return nextApproval;
    },

    listPersonas(): PersonaDefinition[] {
      return Array.from(personas.values());
    },

    getPersona(personaId: string): PersonaDefinition {
      return getPersonaOrThrow(personaId);
    },

    setActivePersona(sessionId: string, personaId: string): SessionRecord {
      return this.updateSession(sessionId, {
        activePersonaId: personaId,
      });
    },

    getUsageSummary(window: UsageWindow): UsageSummary {
      const nowDate = new Date();
      const threshold =
        window === "today"
          ? new Date(nowDate.getTime() - 24 * 60 * 60 * 1000)
          : window === "week"
            ? new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000)
            : new Date(0);

      const records = usageRecords.filter(
        (record) => new Date(record.createdAt).getTime() >= threshold.getTime(),
      );

      return records.reduce<UsageSummary>(
        (summary, record) => ({
          window,
          requestCount: summary.requestCount + 1,
          inputTokens: summary.inputTokens + record.inputTokens,
          outputTokens: summary.outputTokens + record.outputTokens,
          estimatedCost: summary.estimatedCost + (record.estimatedCost ?? 0),
        }),
        {
          window,
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        },
      );
    },
  };
}
