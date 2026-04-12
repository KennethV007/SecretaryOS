import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import {
  getExperimentResults,
  getExperiments,
  getImprovementCandidates,
} from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function ImprovementPage() {
  const [candidates, experiments, results] = await Promise.all([
    getImprovementCandidates(),
    getExperiments(),
    getExperimentResults(),
  ]);

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Improvement"
        description="Candidate, experiment, and governance signals for the self-improvement loop."
        chip="Governance"
      />
      <DataList
        title="Candidates"
        description="Proposed improvements to prompts, routing, memory, or workflows."
        items={candidates.map((candidate) => ({
          title: candidate.title,
          description: candidate.description,
          meta: [candidate.targetSurface, candidate.status],
        }))}
      />
      <DataList
        title="Experiments"
        description="Variant runs attached to improvement candidates."
        items={experiments.map((experiment) => ({
          title: experiment.variantName,
          description: experiment.status,
          meta: experiment.candidateId ? [experiment.candidateId] : undefined,
        }))}
      />
      <DataList
        title="Experiment Results"
        description="Per-metric results captured during benchmark runs."
        items={results.map((result) => ({
          title: result.metricName,
          description: String(result.metricValue),
          meta: [result.experimentId],
        }))}
      />
    </div>
  );
}
