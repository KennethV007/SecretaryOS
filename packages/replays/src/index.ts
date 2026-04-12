import { type ReplayCase, ReplayCaseSchema, createId } from "@secretaryos/core";

export type ReplayStore = {
  cases: ReplayCase[];
  addCase(
    caseData: Omit<ReplayCase, "id" | "createdAt"> & { createdAt?: string },
  ): ReplayCase;
  listCases(): ReplayCase[];
};

export function createReplayStore(
  initialCases: ReplayCase[] = [],
): ReplayStore {
  const cases = [...initialCases];

  return {
    cases,
    addCase(caseData) {
      const replayCase = ReplayCaseSchema.parse({
        ...caseData,
        id: createId("replay"),
        createdAt: caseData.createdAt ?? new Date().toISOString(),
      });

      cases.push(replayCase);
      return replayCase;
    },
    listCases() {
      return [...cases].sort((left, right) =>
        String(right.createdAt).localeCompare(String(left.createdAt)),
      );
    },
  };
}

export function captureReplayCase(input: {
  name: string;
  category: string;
  inputPayload: Record<string, unknown>;
  expectedTraits: string[];
}): ReplayCase {
  return {
    id: createId("replay"),
    name: input.name,
    category: input.category,
    inputPayload: input.inputPayload,
    expectedTraits: input.expectedTraits,
    createdAt: new Date().toISOString(),
  };
}
