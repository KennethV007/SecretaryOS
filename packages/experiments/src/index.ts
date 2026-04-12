import {
  type Experiment,
  type ExperimentResult,
  createId,
} from "@secretaryos/core";

export function createExperiment(
  input: Omit<Experiment, "id" | "createdAt"> & { createdAt?: string },
): Experiment {
  return {
    id: createId("experiment"),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...input,
  };
}

export function compareExperimentResults(
  results: ExperimentResult[],
): Record<string, number> {
  return results.reduce<Record<string, number>>((accumulator, result) => {
    accumulator[result.metricName] = result.metricValue;
    return accumulator;
  }, {});
}
