import {
  type ApprovalRecord,
  type ApprovalStatus,
  type CreateMessageInput,
  type CreateSessionInput,
  type CreateTaskInput,
  DEFAULT_MODE,
  type EvalRun,
  type Experiment,
  type ExperimentResult,
  type ImprovementCandidate,
  type MemoryRecord,
  type MemoryScope,
  type Mode,
  type PolicyVersion,
  type PromptVersion,
  type ReplayCase,
  type SessionMessageRecord,
  type SessionRecord,
  type SessionTurn,
  type SystemIncident,
  type TaskRecord,
  type TaskStatus,
  type TaskType,
  type UpdateSessionInput,
  type UsageCapture,
  type UsageRecord,
  type UsageWindow,
  createId,
} from "@secretaryos/core";
import { createEvalRun } from "@secretaryos/evals";
import type { MemoryWriteJob, TaskExecutionJob } from "@secretaryos/events";
import {
  DEFAULT_ACTIVE_CHARACTER_PATH,
  DEFAULT_PERSONA_PACK_ROOT,
  type PersonaDefinition,
  type PersonaPackInput,
  getActivePersona,
  getDefaultPersona,
  loadPersonaCatalog,
  setActivePersona as persistActivePersona,
  resolvePersonaForMode,
  savePersonaPack,
} from "@secretaryos/personas";
import { classifyWorkflow, requiresApproval } from "@secretaryos/policy";
import { captureReplayCase } from "@secretaryos/replays";

const DEFAULT_USER_ID = "user_local";

export type RoutedTurn = {
  taskType: TaskType;
  task: TaskRecord;
};

export type RuntimeStats = {
  sessions: number;
  tasks: number;
  approvalsPending: number;
  memories: number;
  usageRecords: number;
  replayCases: number;
  evalRuns: number;
  improvementCandidates: number;
};

export type MemoryQuery = {
  text?: string;
  scope?: MemoryScope;
  projectId?: string;
  personaId?: string;
  limit?: number;
};

export type TaskQueuePort = {
  enqueue(job: TaskExecutionJob): Promise<{ id?: string } | undefined>;
};

export type TaskCreationResult = {
  session: SessionRecord;
  task: TaskRecord;
  approval?: ApprovalRecord;
  enqueued: boolean;
};

export type SessionMessageInput = {
  sessionId: string;
  role: SessionMessageRecord["role"];
  content: string;
  relatedTaskId?: string;
  stream?: boolean;
};

export type ApprovalResolutionResult = {
  approval: ApprovalRecord;
  task: TaskRecord;
  enqueued: boolean;
};

export type TaskCompletionResult = {
  task: TaskRecord;
  outputText?: string;
  usage?: UsageCapture;
};

export type InMemoryRuntimeState = {
  personaPackRoot: string;
  activePersonaStorePath: string;
  activePersonaId: string;
  sessions: Map<string, SessionRecord>;
  messages: Map<string, SessionMessageRecord[]>;
  tasks: Map<string, TaskRecord>;
  approvals: Map<string, ApprovalRecord>;
  memories: Map<string, MemoryRecord>;
  usageRecords: UsageRecord[];
  personas: Map<string, PersonaDefinition>;
  replayCases: ReplayCase[];
  evalRuns: EvalRun[];
  improvementCandidates: ImprovementCandidate[];
  experiments: Experiment[];
  experimentResults: ExperimentResult[];
  systemIncidents: SystemIncident[];
  promptVersions: PromptVersion[];
  policyVersions: PolicyVersion[];
};

export class OrchestratorError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export function resolveTaskType(turn: SessionTurn): TaskType {
  if (turn.mode === "planner") {
    return "planner_deep_dive";
  }

  if (turn.mode === "after_hours") {
    return "after_hours_chat";
  }

  return "chat_assistant";
}

export function routeTurn(turn: SessionTurn): RoutedTurn {
  const taskType = resolveTaskType(turn);
  const mode = turn.mode ?? DEFAULT_MODE;

  return {
    taskType,
    task: {
      id: createId("task"),
      sessionId: turn.sessionId,
      type: taskType,
      status: "queued",
      approvalClass: classifyWorkflow(taskType),
      input: turn.content,
      mode,
      personaId: turn.personaId,
      projectId: turn.projectId,
      title: turn.content.slice(0, 80),
    },
  };
}

function buildConversationContext(messages: SessionMessageRecord[]): string {
  if (messages.length === 0) {
    return "";
  }

  return [
    "Conversation context:",
    ...messages.map((message) => `${message.role}: ${message.content}`),
  ].join("\n");
}

export function createInMemoryRuntimeState(
  options: {
    personaPackRoot?: string;
    activePersonaStorePath?: string;
  } = {},
): InMemoryRuntimeState {
  const personaPackRoot = options.personaPackRoot ?? DEFAULT_PERSONA_PACK_ROOT;
  const personas = loadPersonaCatalog({
    rootDir: personaPackRoot,
  });
  const personaList = personas.length
    ? personas
    : [getDefaultPersona([], personaPackRoot)];
  const activePersonaStorePath =
    options.activePersonaStorePath ?? DEFAULT_ACTIVE_CHARACTER_PATH;
  const activePersona = getActivePersona(personaList, {
    filePath: activePersonaStorePath,
  });

  return {
    personaPackRoot,
    activePersonaStorePath,
    activePersonaId: activePersona.id,
    sessions: new Map<string, SessionRecord>(),
    messages: new Map<string, SessionMessageRecord[]>(),
    tasks: new Map<string, TaskRecord>(),
    approvals: new Map<string, ApprovalRecord>(),
    memories: new Map<string, MemoryRecord>(),
    usageRecords: [],
    personas: new Map(personaList.map((persona) => [persona.id, persona])),
    replayCases: [],
    evalRuns: [],
    improvementCandidates: [],
    experiments: [],
    experimentResults: [],
    systemIncidents: [],
    promptVersions: [],
    policyVersions: [],
  };
}

function now(): string {
  return new Date().toISOString();
}

function sortByMostRecent<
  T extends { createdAt?: string | Date; lastActiveAt?: string | Date },
>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftValue = String(left.lastActiveAt ?? left.createdAt ?? "");
    const rightValue = String(right.lastActiveAt ?? right.createdAt ?? "");

    return rightValue.localeCompare(leftValue);
  });
}

export class SecretaryOrchestrator {
  constructor(
    private readonly state: InMemoryRuntimeState = createInMemoryRuntimeState(),
    private readonly options: {
      taskQueue?: TaskQueuePort;
      personaPackRoot?: string;
      activePersonaStorePath?: string;
    } = {},
  ) {}

  private getPersonaOrThrow(personaId: string): PersonaDefinition {
    const persona = this.state.personas.get(personaId);

    if (!persona) {
      throw new OrchestratorError(404, `Persona '${personaId}' was not found.`);
    }

    return persona;
  }

  private resolvePersona(
    mode: Mode,
    requestedPersonaId?: string,
  ): PersonaDefinition {
    if (requestedPersonaId && !this.state.personas.has(requestedPersonaId)) {
      throw new OrchestratorError(
        404,
        `Persona '${requestedPersonaId}' was not found.`,
      );
    }

    return resolvePersonaForMode(
      mode,
      requestedPersonaId ?? this.state.activePersonaId,
      Array.from(this.state.personas.values()),
    );
  }

  private getSessionOrThrow(sessionId: string): SessionRecord {
    const session = this.state.sessions.get(sessionId);

    if (!session) {
      throw new OrchestratorError(404, `Session '${sessionId}' was not found.`);
    }

    return session;
  }

  private getTaskOrThrow(taskId: string): TaskRecord {
    const task = this.state.tasks.get(taskId);

    if (!task) {
      throw new OrchestratorError(404, `Task '${taskId}' was not found.`);
    }

    return task;
  }

  private getMessages(sessionId: string): SessionMessageRecord[] {
    return this.state.messages.get(sessionId) ?? [];
  }

  private appendMessage(input: SessionMessageInput): SessionMessageRecord {
    const message: SessionMessageRecord = {
      id: createId("message"),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt: now(),
      relatedTaskId: input.relatedTaskId,
      stream: input.stream ?? false,
    };

    const nextMessages = [...this.getMessages(input.sessionId), message];
    this.state.messages.set(input.sessionId, nextMessages);

    return message;
  }

  private getApprovalOrThrow(approvalId: string): ApprovalRecord {
    const approval = this.state.approvals.get(approvalId);

    if (!approval) {
      throw new OrchestratorError(
        404,
        `Approval '${approvalId}' was not found.`,
      );
    }

    return approval;
  }

  private async enqueueTask(task: TaskRecord): Promise<boolean> {
    if (!this.options.taskQueue || task.status !== "queued") {
      return false;
    }

    await this.options.taskQueue.enqueue({
      kind: "task.execute",
      task,
      requestedAt: now(),
    });

    return true;
  }

  getStats(): RuntimeStats {
    return {
      sessions: this.state.sessions.size,
      tasks: this.state.tasks.size,
      approvalsPending: Array.from(this.state.approvals.values()).filter(
        (approval) => approval.status === "pending",
      ).length,
      memories: this.state.memories.size,
      usageRecords: this.state.usageRecords.length,
      replayCases: this.state.replayCases.length,
      evalRuns: this.state.evalRuns.length,
      improvementCandidates: this.state.improvementCandidates.length,
    };
  }

  listSessions(): SessionRecord[] {
    return sortByMostRecent(Array.from(this.state.sessions.values()));
  }

  createSession(input: CreateSessionInput): SessionRecord {
    const existing = Array.from(this.state.sessions.values()).find(
      (session) =>
        session.channel === input.channel &&
        session.channelSessionKey === input.channelSessionKey,
    );

    if (existing) {
      const mode = input.mode ?? existing.activeMode;
      const persona = this.resolvePersona(
        mode,
        input.personaId ?? this.state.activePersonaId,
      );

      const nextSession: SessionRecord = {
        ...existing,
        activeMode: mode,
        activePersonaId: persona.id,
        lastActiveAt: now(),
      };

      this.state.sessions.set(nextSession.id, nextSession);
      if (!this.state.messages.has(nextSession.id)) {
        this.state.messages.set(nextSession.id, []);
      }

      return nextSession;
    }

    const mode = input.mode ?? DEFAULT_MODE;
    const persona = this.resolvePersona(
      mode,
      input.personaId ?? this.state.activePersonaId,
    );
    const timestamp = now();
    const session: SessionRecord = {
      id: createId("session"),
      userId: DEFAULT_USER_ID,
      channel: input.channel,
      channelSessionKey: input.channelSessionKey,
      activeMode: mode,
      activePersonaId: persona.id,
      createdAt: timestamp,
      lastActiveAt: timestamp,
    };

    this.state.sessions.set(session.id, session);
    this.state.messages.set(session.id, []);

    return session;
  }

  getSession(sessionId: string): SessionRecord {
    return this.getSessionOrThrow(sessionId);
  }

  updateSession(sessionId: string, input: UpdateSessionInput): SessionRecord {
    const session = this.getSessionOrThrow(sessionId);
    const mode = input.mode ?? session.activeMode;
    const persona = this.resolvePersona(
      mode,
      input.personaId ?? this.state.activePersonaId,
    );

    const nextSession: SessionRecord = {
      ...session,
      activeMode: mode,
      activePersonaId: persona.id,
      lastActiveAt: now(),
    };

    this.state.sessions.set(nextSession.id, nextSession);

    return nextSession;
  }

  async receiveMessage(input: CreateMessageInput): Promise<TaskCreationResult> {
    const session = this.createSession({
      channel: input.channel,
      channelSessionKey: input.channelSessionKey,
      userName: "Local User",
      mode: input.mode,
      personaId: input.personaId ?? this.state.activePersonaId,
    });

    this.appendMessage({
      sessionId: session.id,
      role: "user",
      content: input.content,
      stream: false,
    });

    return this.createTask({
      sessionId: session.id,
      channel: input.channel,
      content: input.content,
      mode: input.mode,
      personaId: input.personaId,
      projectId: input.projectId,
      taskType: input.taskType,
    });
  }

  listTasks(status?: TaskStatus): TaskRecord[] {
    return Array.from(this.state.tasks.values())
      .filter((task) => (status ? task.status === status : true))
      .reverse();
  }

  async createTask(input: CreateTaskInput): Promise<TaskCreationResult> {
    const session = this.getSessionOrThrow(input.sessionId);
    const mode = input.mode ?? session.activeMode;
    const persona = this.resolvePersona(
      mode,
      input.personaId ?? this.state.activePersonaId,
    );
    const activeSession: SessionRecord = {
      ...session,
      activeMode: mode,
      activePersonaId: persona.id,
      lastActiveAt: now(),
    };

    this.state.sessions.set(activeSession.id, activeSession);

    const packedInput = [
      buildConversationContext(this.getMessages(activeSession.id).slice(-12)),
      input.content,
    ]
      .filter(Boolean)
      .join("\n\n");

    const routed = routeTurn({
      sessionId: activeSession.id,
      channel: input.channel,
      content: packedInput,
      mode,
      personaId: persona.id,
      projectId: input.projectId,
    });

    let task: TaskRecord = {
      ...routed.task,
      mode,
      personaId: persona.id,
      projectId: input.projectId,
    };

    if (input.taskType && input.taskType !== task.type) {
      task = {
        ...task,
        type: input.taskType,
        approvalClass: classifyWorkflow(input.taskType),
      };
    }

    let approval: ApprovalRecord | undefined;

    if (requiresApproval(task.approvalClass)) {
      approval = {
        id: createId("approval"),
        taskId: task.id,
        actionName: task.type,
        reason: "This task requires explicit approval before execution.",
        requestedInChannel: activeSession.channel,
        status: "pending",
        requestedAt: now(),
      };

      task = {
        ...task,
        status: "awaiting_approval",
      };

      this.state.approvals.set(approval.id, approval);
    }

    this.appendMessage({
      sessionId: activeSession.id,
      role: "assistant",
      content: `Queued ${task.type}.`,
      relatedTaskId: task.id,
      stream: true,
    });

    this.state.tasks.set(task.id, task);

    const enqueued = await this.enqueueTask(task);

    return {
      session: activeSession,
      task,
      approval,
      enqueued,
    };
  }

  getTask(taskId: string): TaskRecord {
    return this.getTaskOrThrow(taskId);
  }

  recordTaskUpdate(task: TaskRecord): TaskRecord {
    const current = this.getTaskOrThrow(task.id);
    const nextTask: TaskRecord = {
      ...current,
      ...task,
    };

    this.state.tasks.set(nextTask.id, nextTask);

    return nextTask;
  }

  recordTaskCompletion(result: TaskCompletionResult): TaskRecord {
    const current = this.getTaskOrThrow(result.task.id);
    const nextTask: TaskRecord = {
      ...current,
      ...result.task,
      outputText:
        result.outputText ?? result.task.outputText ?? current.outputText,
    };

    this.state.tasks.set(nextTask.id, nextTask);

    const messages = this.getMessages(nextTask.sessionId);
    let updatedExistingMessage = false;
    const updatedMessages = messages.map((message) => {
      if (
        message.relatedTaskId === nextTask.id &&
        message.role === "assistant"
      ) {
        updatedExistingMessage = true;

        return {
          ...message,
          content: result.outputText ?? nextTask.outputText ?? message.content,
          stream: false,
        };
      }

      return message;
    });

    if (!updatedExistingMessage) {
      const text = result.outputText ?? nextTask.outputText;
      if (text) {
        updatedMessages.push({
          id: createId("message"),
          sessionId: nextTask.sessionId,
          role: "assistant",
          content: text,
          createdAt: now(),
          relatedTaskId: nextTask.id,
          stream: false,
        });
      }
    }

    this.state.messages.set(nextTask.sessionId, updatedMessages);

    this.state.replayCases.push(
      captureReplayCase({
        name: nextTask.title ?? nextTask.type,
        category: "task",
        inputPayload: {
          taskId: nextTask.id,
          sessionId: nextTask.sessionId,
          type: nextTask.type,
          mode: nextTask.mode,
          input: nextTask.input,
          status: nextTask.status,
        },
        expectedTraits: [
          "normalized",
          nextTask.status === "complete" ? "completed" : "pending",
        ],
      }),
    );

    if (result.usage) {
      this.state.usageRecords.push({
        id: createId("usage"),
        provider: result.usage.provider,
        model: result.usage.model,
        lane: nextTask.type,
        taskId: nextTask.id,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCost: result.usage.estimatedCost,
        createdAt: now(),
      });
    }

    this.state.evalRuns.push(
      createEvalRun({
        evalName: `task-${nextTask.type}`,
        taskId: nextTask.id,
        candidateId: undefined,
        score: nextTask.status === "complete" ? 1 : 0,
        passed: nextTask.status === "complete",
        notes: result.outputText
          ? "Auto-scored from task completion."
          : undefined,
      }),
    );

    return nextTask;
  }

  listApprovals(status?: ApprovalStatus): ApprovalRecord[] {
    const approvals = Array.from(this.state.approvals.values()).filter(
      (approval) => (status ? approval.status === status : true),
    );

    return approvals.sort((left, right) =>
      String(right.requestedAt).localeCompare(String(left.requestedAt)),
    );
  }

  getApproval(approvalId: string): ApprovalRecord {
    return this.getApprovalOrThrow(approvalId);
  }

  async resolveApproval(
    approvalId: string,
    status: "approved" | "denied",
  ): Promise<ApprovalResolutionResult> {
    const approval = this.getApprovalOrThrow(approvalId);
    const nextApproval: ApprovalRecord = {
      ...approval,
      status,
      resolvedAt: now(),
    };

    this.state.approvals.set(nextApproval.id, nextApproval);

    const task = this.getTaskOrThrow(approval.taskId);
    const nextTask: TaskRecord = {
      ...task,
      status: status === "approved" ? "queued" : "canceled",
    };

    this.state.tasks.set(nextTask.id, nextTask);

    const enqueued =
      status === "approved" ? await this.enqueueTask(nextTask) : false;

    return {
      approval: nextApproval,
      task: nextTask,
      enqueued,
    };
  }

  listPersonas(): PersonaDefinition[] {
    return Array.from(this.state.personas.values());
  }

  getPersona(personaId: string): PersonaDefinition {
    return this.getPersonaOrThrow(personaId);
  }

  getActivePersona(): PersonaDefinition {
    return this.getPersonaOrThrow(this.state.activePersonaId);
  }

  createPersona(input: PersonaPackInput): PersonaDefinition {
    const persona = savePersonaPack(input, {
      rootDir: this.state.personaPackRoot,
    });

    this.state.personas.set(persona.id, persona);

    return persona;
  }

  setActivePersona(sessionId: string, personaId: string): SessionRecord {
    return this.updateSession(sessionId, {
      personaId,
    });
  }

  setGlobalActivePersona(personaId: string): PersonaDefinition {
    const persona = this.getPersonaOrThrow(personaId);
    persistActivePersona(persona.id, Array.from(this.state.personas.values()), {
      filePath: this.state.activePersonaStorePath,
    });

    this.state.activePersonaId = persona.id;

    for (const session of this.state.sessions.values()) {
      this.state.sessions.set(session.id, {
        ...session,
        activePersonaId: persona.id,
        lastActiveAt: now(),
      });
    }

    return persona;
  }

  recordMemoryWrite(job: MemoryWriteJob): MemoryRecord {
    const task = this.state.tasks.get(job.taskId);
    const memory: MemoryRecord = {
      id: createId("memory"),
      kind: task?.mode === "after_hours" ? "conversation" : "task",
      scope: job.scope,
      source: "codex_task",
      content: job.content,
      summary: job.content.slice(0, 160),
      projectId: task?.projectId,
      personaId: task?.personaId,
      taskId: job.taskId,
      createdAt: job.requestedAt,
    };

    this.state.memories.set(memory.id, memory);

    return memory;
  }

  listMemory(query: MemoryQuery = {}): MemoryRecord[] {
    const normalizedText = query.text?.trim().toLowerCase();
    const filtered = Array.from(this.state.memories.values()).filter(
      (memory) => {
        if (query.scope && memory.scope !== query.scope) {
          return false;
        }

        if (query.projectId && memory.projectId !== query.projectId) {
          return false;
        }

        if (query.personaId && memory.personaId !== query.personaId) {
          return false;
        }

        if (!normalizedText) {
          return true;
        }

        return [memory.content, memory.summary]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedText));
      },
    );

    return sortByMostRecent(filtered).slice(0, query.limit ?? 50);
  }

  listSessionMessages(sessionId: string): SessionMessageRecord[] {
    return [...this.getMessages(sessionId)];
  }

  getSessionSummary(sessionId: string): string {
    return this.getMessages(sessionId)
      .slice(-6)
      .map((message) => `${message.role}: ${message.content.slice(0, 120)}`)
      .join("\n");
  }

  getUsageSummary(window: UsageWindow) {
    const nowDate = new Date();
    const threshold =
      window === "today"
        ? new Date(nowDate.getTime() - 24 * 60 * 60 * 1000)
        : window === "week"
          ? new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000)
          : new Date(0);

    const records = this.state.usageRecords.filter(
      (record) =>
        new Date(String(record.createdAt)).getTime() >= threshold.getTime(),
    );

    return records.reduce(
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
  }

  listReplayCases() {
    return [...this.state.replayCases].reverse();
  }

  listEvalRuns() {
    return [...this.state.evalRuns].reverse();
  }

  listImprovementCandidates() {
    return [...this.state.improvementCandidates].reverse();
  }

  listExperiments() {
    return [...this.state.experiments].reverse();
  }

  listExperimentResults() {
    return [...this.state.experimentResults].reverse();
  }

  listSystemIncidents() {
    return [...this.state.systemIncidents].reverse();
  }

  listPromptVersions() {
    return [...this.state.promptVersions].reverse();
  }

  listPolicyVersions() {
    return [...this.state.policyVersions].reverse();
  }

  createImprovementCandidate(
    input: Omit<ImprovementCandidate, "id" | "createdAt" | "status"> & {
      status?: ImprovementCandidate["status"];
    },
  ) {
    const candidate: ImprovementCandidate = {
      ...input,
      status: input.status ?? "proposed",
      id: createId("candidate"),
      createdAt: now(),
    };

    this.state.improvementCandidates.push(candidate);

    return candidate;
  }

  createExperiment(
    input: Omit<Experiment, "id" | "createdAt" | "status"> & {
      status?: Experiment["status"];
      createdAt?: string;
    },
  ) {
    const experiment: Experiment = {
      ...input,
      status: input.status ?? "queued",
      id: createId("experiment"),
      createdAt: input.createdAt ?? now(),
    };

    this.state.experiments.push(experiment);

    return experiment;
  }

  createExperimentResult(input: Omit<ExperimentResult, "id">) {
    const result: ExperimentResult = {
      ...input,
      id: createId("result"),
    };

    this.state.experimentResults.push(result);

    return result;
  }

  createSystemIncident(input: Omit<SystemIncident, "id" | "createdAt">) {
    const incident: SystemIncident = {
      ...input,
      id: createId("incident"),
      createdAt: now(),
    };

    this.state.systemIncidents.push(incident);

    return incident;
  }

  createPromptVersion(
    input: Omit<PromptVersion, "id" | "createdAt" | "active"> & {
      active?: boolean;
      createdAt?: string;
    },
  ) {
    const version: PromptVersion = {
      ...input,
      active: input.active ?? false,
      id: createId("prompt"),
      createdAt: input.createdAt ?? now(),
    };

    this.state.promptVersions.push(version);

    return version;
  }

  createPolicyVersion(
    input: Omit<PolicyVersion, "id" | "createdAt" | "active"> & {
      active?: boolean;
      createdAt?: string;
    },
  ) {
    const version: PolicyVersion = {
      ...input,
      active: input.active ?? false,
      id: createId("policy"),
      createdAt: input.createdAt ?? now(),
    };

    this.state.policyVersions.push(version);

    return version;
  }
}
