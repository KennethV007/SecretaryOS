import { type EvalRun, createId } from "@secretaryos/core";

export type EvalDefinition = {
  name: string;
  input: Record<string, unknown>;
  expectedBehavior: string;
  scoringRubric: string;
  goldenOutput?: string;
  tags: string[];
};

export type EvalRunInput = Omit<EvalRun, "id" | "createdAt"> & {
  createdAt?: string;
};

export function createEvalRun(input: EvalRunInput): EvalRun {
  return {
    id: createId("eval"),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...input,
  };
}

export function scoreEvalRun(input: {
  passed: boolean;
  latencyMs?: number;
  retries?: number;
  toolErrors?: number;
  memoryUsefulness?: number;
}): number {
  let score = input.passed ? 1 : 0;
  score -= Math.min((input.retries ?? 0) * 0.1, 0.3);
  score -= Math.min((input.toolErrors ?? 0) * 0.15, 0.45);
  score -= Math.min((input.latencyMs ?? 0) / 10000, 0.2);
  score += Math.min((input.memoryUsefulness ?? 0) * 0.05, 0.2);
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}
