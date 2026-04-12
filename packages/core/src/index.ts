import { randomUUID } from "node:crypto";
import { z } from "zod";

export const MODES = ["assistant", "planner", "after_hours"] as const;
export const CHANNELS = [
  "discord",
  "dashboard",
  "cli",
  "voice",
  "imessage",
] as const;
export const TASK_TYPES = [
  "chat_assistant",
  "planner_deep_dive",
  "repo_execute",
  "repo_audit",
  "filesystem_reorg",
  "security_sweep",
  "markdown_runbook_execute",
  "usage_report",
  "daily_checkin",
  "after_hours_chat",
] as const;
export const TASK_STATUSES = [
  "queued",
  "planning",
  "awaiting_approval",
  "running",
  "review",
  "complete",
  "failed",
  "canceled",
] as const;
export const TASK_STEP_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "complete",
  "failed",
  "skipped",
] as const;
export const APPROVAL_CLASSES = [0, 1, 2, 3] as const;
export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "denied",
  "expired",
] as const;
export const MEMORY_KINDS = [
  "conversation",
  "project",
  "event",
  "preference",
  "persona",
  "repo",
  "task",
] as const;
export const MEMORY_SCOPES = [
  "global",
  "project",
  "repo",
  "persona",
  "channel",
  "after_hours_only",
] as const;
export const MEMORY_SOURCES = [
  "discord",
  "imessage",
  "voice",
  "dashboard",
  "codex_task",
  "api",
] as const;
export const PROMPT_SURFACES = [
  "system",
  "assistant_mode",
  "planner_mode",
  "after_hours_mode",
  "workflow",
  "memory_injection",
] as const;
export const POLICY_SURFACES = [
  "routing",
  "memory",
  "workflow",
  "prompt",
] as const;
export const MODEL_PROVIDERS = [
  "codex_mcp",
  "openrouter",
  "mempalace",
  "system",
] as const;
export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export const EVENT_NAMES = [
  "task.created",
  "task.started",
  "task.awaiting_approval",
  "task.step.updated",
  "task.stream.chunk",
  "task.completed",
  "task.failed",
  "memory.write.requested",
  "memory.write.completed",
  "usage.recorded",
  "improvement.candidate.created",
  "replay.case.captured",
  "eval.run.completed",
  "proactive.followup.due",
] as const;

export const ModeSchema = z.enum(MODES);
export const ChannelSchema = z.enum(CHANNELS);
export const TaskTypeSchema = z.enum(TASK_TYPES);
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const TaskStepStatusSchema = z.enum(TASK_STEP_STATUSES);
export const ApprovalClassSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
export const MemoryKindSchema = z.enum(MEMORY_KINDS);
export const MemoryScopeSchema = z.enum(MEMORY_SCOPES);
export const MemorySourceSchema = z.enum(MEMORY_SOURCES);
export const ModelProviderSchema = z.enum(MODEL_PROVIDERS);
export const ReasoningEffortSchema = z.enum(REASONING_EFFORTS);
export const EventNameSchema = z.enum(EVENT_NAMES);

export type Mode = z.infer<typeof ModeSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type WorkflowId = TaskType;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskStepStatus = z.infer<typeof TaskStepStatusSchema>;
export type ApprovalClass = z.infer<typeof ApprovalClassSchema>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type MemoryKind = z.infer<typeof MemoryKindSchema>;
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type MemorySource = z.infer<typeof MemorySourceSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type EventName = z.infer<typeof EventNameSchema>;

export const DEFAULT_MODE: Mode = "assistant";
export const DEFAULT_TASK_TYPE: TaskType = "chat_assistant";
export const DEFAULT_WORKFLOW: WorkflowId = DEFAULT_TASK_TYPE;

export const IdSchema = z.string().min(1);
export const TimestampSchema = z.string().datetime().or(z.date());

export const SessionTurnSchema = z.object({
  sessionId: IdSchema,
  channel: ChannelSchema,
  content: z.string().min(1),
  mode: ModeSchema.optional(),
  personaId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  channelSessionKey: z.string().min(1).optional(),
  sourceMessageId: z.string().min(1).optional(),
});

export const SessionRecordSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  channel: ChannelSchema,
  channelSessionKey: z.string().min(1),
  activeMode: ModeSchema,
  activePersonaId: IdSchema,
  createdAt: TimestampSchema,
  lastActiveAt: TimestampSchema,
});

export const SessionMessageRoleSchema = z.enum(["user", "assistant", "system"]);

export const SessionMessageRecordSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  role: SessionMessageRoleSchema,
  content: z.string().min(1),
  createdAt: TimestampSchema,
  relatedTaskId: IdSchema.optional(),
  stream: z.boolean().default(false),
});

export const TaskRecordSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  approvalClass: ApprovalClassSchema,
  input: z.string().min(1),
  mode: ModeSchema.optional(),
  personaId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  outputText: z.string().optional(),
  errorMessage: z.string().optional(),
});

export const TaskStepRecordSchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  stepIndex: z.number().int().nonnegative(),
  label: z.string().min(1),
  status: TaskStepStatusSchema,
  outputText: z.string().optional(),
  artifactPath: z.string().optional(),
});

export const ApprovalRecordSchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  actionName: z.string().min(1),
  reason: z.string().min(1),
  requestedInChannel: ChannelSchema,
  status: ApprovalStatusSchema,
  requestedAt: TimestampSchema,
  resolvedAt: TimestampSchema.optional(),
});

export const UsageRecordSchema = z.object({
  id: IdSchema,
  provider: ModelProviderSchema,
  model: z.string().min(1),
  lane: z.string().min(1),
  taskId: IdSchema.optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative().optional(),
  createdAt: TimestampSchema,
});

export const UsageCaptureSchema = z.object({
  provider: ModelProviderSchema,
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative().optional(),
});

export const PromptSurfaceSchema = z.enum([...PROMPT_SURFACES]);

export const PolicySurfaceSchema = z.enum([...POLICY_SURFACES]);

export const PromotionTierSchema = z.enum([
  "auto_adopt",
  "approval_required",
  "locked",
]);

export const ReplayCaseSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: z.string().min(1),
  inputPayload: z.record(z.string(), z.unknown()),
  expectedTraits: z.array(z.string()),
  createdAt: TimestampSchema,
});

export const EvalRunSchema = z.object({
  id: IdSchema,
  evalName: z.string().min(1),
  taskId: IdSchema.optional(),
  candidateId: IdSchema.optional(),
  score: z.number(),
  passed: z.boolean(),
  notes: z.string().optional(),
  createdAt: TimestampSchema,
});

export const ImprovementCandidateSchema = z.object({
  id: IdSchema,
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  targetSurface: z.string().min(1),
  proposedBy: z.string().min(1),
  status: z.enum([
    "proposed",
    "experimental",
    "submitted_for_approval",
    "adopted",
    "rejected",
  ]),
  createdAt: TimestampSchema,
});

export const ExperimentSchema = z.object({
  id: IdSchema,
  candidateId: IdSchema.optional(),
  variantName: z.string().min(1),
  configJson: z.record(z.string(), z.unknown()),
  status: z.enum(["queued", "running", "completed", "failed"]),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
});

export const ExperimentResultSchema = z.object({
  id: IdSchema,
  experimentId: IdSchema,
  metricName: z.string().min(1),
  metricValue: z.number(),
  notes: z.string().optional(),
});

export const SystemIncidentSchema = z.object({
  id: IdSchema,
  taskId: IdSchema.optional(),
  category: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string().min(1),
  rootCauseGuess: z.string().optional(),
  createdAt: TimestampSchema,
});

export const PromptVersionSchema = z.object({
  id: IdSchema,
  scope: PromptSurfaceSchema,
  name: z.string().min(1),
  content: z.string().min(1),
  version: z.number().int().positive(),
  active: z.boolean(),
  createdAt: TimestampSchema,
});

export const PolicyVersionSchema = z.object({
  id: IdSchema,
  surface: PolicySurfaceSchema,
  configJson: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  active: z.boolean(),
  createdAt: TimestampSchema,
});

export const MemoryRecordSchema = z.object({
  id: IdSchema,
  kind: MemoryKindSchema,
  scope: MemoryScopeSchema,
  source: MemorySourceSchema,
  content: z.string().min(1),
  summary: z.string().optional(),
  projectId: IdSchema.optional(),
  personaId: IdSchema.optional(),
  taskId: IdSchema.optional(),
  createdAt: TimestampSchema,
});

export const CreateSessionInputSchema = z.object({
  channel: ChannelSchema,
  channelSessionKey: z.string().min(1),
  userName: z.string().min(1).default("Local User"),
  mode: ModeSchema.optional(),
  personaId: IdSchema.optional(),
});

export const UpdateSessionInputSchema = z
  .object({
    mode: ModeSchema.optional(),
    personaId: IdSchema.optional(),
  })
  .refine(
    (value) => value.mode !== undefined || value.personaId !== undefined,
    {
      message: "At least one session field must be provided.",
    },
  );

export const CreateTaskInputSchema = z.object({
  sessionId: IdSchema,
  channel: ChannelSchema,
  content: z.string().min(1),
  mode: ModeSchema.optional(),
  personaId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  taskType: TaskTypeSchema.optional(),
});

export const CreateMessageInputSchema = z.object({
  channel: ChannelSchema,
  channelSessionKey: z.string().min(1),
  content: z.string().min(1),
  mode: ModeSchema.optional(),
  personaId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  taskType: TaskTypeSchema.optional(),
});

export const ResolveApprovalInputSchema = z.object({
  status: z.enum(["approved", "denied"]),
});

export const SetActivePersonaInputSchema = z.object({
  sessionId: IdSchema,
  personaId: IdSchema,
});

export const SetGlobalActivePersonaInputSchema = z.object({
  personaId: IdSchema,
});

export const UsageWindowSchema = z.enum(["today", "week", "all"]);

export type SessionTurn = z.infer<typeof SessionTurnSchema>;
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type SessionMessageRole = z.infer<typeof SessionMessageRoleSchema>;
export type SessionMessageRecord = z.infer<typeof SessionMessageRecordSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type TaskStepRecord = z.infer<typeof TaskStepRecordSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
export type UsageCapture = z.infer<typeof UsageCaptureSchema>;
export type PromptSurface = z.infer<typeof PromptSurfaceSchema>;
export type PolicySurface = z.infer<typeof PolicySurfaceSchema>;
export type PromotionTier = z.infer<typeof PromotionTierSchema>;
export type ReplayCase = z.infer<typeof ReplayCaseSchema>;
export type EvalRun = z.infer<typeof EvalRunSchema>;
export type ImprovementCandidate = z.infer<typeof ImprovementCandidateSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
export type SystemIncident = z.infer<typeof SystemIncidentSchema>;
export type PromptVersion = z.infer<typeof PromptVersionSchema>;
export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionInputSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>;
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInputSchema>;
export type SetActivePersonaInput = z.infer<typeof SetActivePersonaInputSchema>;
export type SetGlobalActivePersonaInput = z.infer<
  typeof SetGlobalActivePersonaInputSchema
>;
export type UsageWindow = z.infer<typeof UsageWindowSchema>;

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
