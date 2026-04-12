import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import { StatCard } from "../../src/components/stat-card";
import { getUsageSummary } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const usage = await getUsageSummary();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Usage"
        description="Token, request, and estimated cost visibility for the current dashboard window."
        chip="Telemetry"
      />
      <div className="stats-grid">
        <StatCard
          label="Requests"
          value={String(usage.requestCount)}
          helpText="Aggregated usage rows for the current window."
        />
        <StatCard
          label="Input Tokens"
          value={String(usage.inputTokens)}
          helpText="Prompt-side token count returned by the API."
        />
        <StatCard
          label="Output Tokens"
          value={String(usage.outputTokens)}
          helpText="Completion-side token count returned by the API."
        />
        <StatCard
          label="Estimated Cost"
          value={`$${usage.estimatedCost.toFixed(2)}`}
          helpText="Derived from recorded usage if available."
        />
      </div>
      <DataList
        title="Window"
        description="The dashboard currently requests the daily usage summary."
        items={[
          {
            title: "Current window",
            description: usage.window,
            meta: ["summary"],
          },
        ]}
      />
    </div>
  );
}
