import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import { getReplayCases } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function ReplaysPage() {
  const replays = await getReplayCases();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Replays"
        description="Captured interactions available for deterministic replay and regression analysis."
        chip="Control Plane"
      />
      <DataList
        title="Replay Cases"
        description="Normalized session and task inputs recorded by the orchestrator."
        items={replays.map((item) => ({
          title: item.name,
          description: item.category,
          meta: Object.keys(item.inputPayload),
        }))}
      />
    </div>
  );
}
