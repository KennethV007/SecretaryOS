import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import { getEvalRuns } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function EvalsPage() {
  const evalRuns = await getEvalRuns();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Evals"
        description="Scored replay and task evaluations surfaced from the control plane."
        chip="Observability"
      />
      <DataList
        title="Evaluation Runs"
        description="Each run captures score, pass state, and notes."
        items={evalRuns.map((run) => ({
          title: run.evalName,
          description: run.notes ?? "No notes recorded.",
          meta: [run.passed ? "passed" : "failed", `score:${run.score}`],
          tone: run.passed ? "neutral" : "warning",
        }))}
      />
    </div>
  );
}
