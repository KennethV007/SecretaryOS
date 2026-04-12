import type {
  ApprovalClass,
  ApprovalStatus,
  EventName,
  MemoryScope,
  Mode,
  PromptSurface,
  TaskStatus,
  TaskType,
} from "@secretaryos/core";

export type UsageEvent = {
  sessionId: string;
  workflow: string;
  tokens?: number;
  durationMs?: number;
};

export type TelemetryRecord = {
  event: EventName;
  sessionId?: string;
  taskId?: string;
  mode?: Mode;
  taskType?: TaskType;
  taskStatus?: TaskStatus;
  approvalClass?: ApprovalClass;
  approvalStatus?: ApprovalStatus;
  memoryScope?: MemoryScope;
  promptSurface?: PromptSurface;
  latencyMs?: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
};

export function createTelemetryRecord(
  record: TelemetryRecord,
): TelemetryRecord {
  return {
    ...record,
    metadata: record.metadata ?? {},
  };
}
