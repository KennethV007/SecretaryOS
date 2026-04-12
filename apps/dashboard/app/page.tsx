import { DataList } from "../src/components/data-list";
import { PageHeader } from "../src/components/page-header";
import { StatCard } from "../src/components/stat-card";
import {
  getHealthSnapshot,
  getSessions,
  getUsageSummary,
} from "../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [health, usage, sessions] = await Promise.all([
    getHealthSnapshot(),
    getUsageSummary(),
    getSessions(),
  ]);

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Control Room"
        description="A live overview of the assistant runtime, task load, and control-plane health."
        chip="Overview"
      />

      <div className="stats-grid">
        <StatCard
          label="API Health"
          value={health.status.toUpperCase()}
          helpText={`Service: ${health.service}`}
        />
        <StatCard
          label="Tracked Tasks"
          value={String(health.stats?.tasks ?? 0)}
          helpText="Current task count surfaced by the API."
        />
        <StatCard
          label="Pending Approvals"
          value={String(health.stats?.approvalsPending ?? 0)}
          helpText="Tasks waiting on explicit user confirmation."
        />
        <StatCard
          label="Today’s Requests"
          value={String(usage.requestCount)}
          helpText="Usage records reported for the current day window."
        />
      </div>

      <div className="section-grid">
        <DataList
          title="Runtime Signals"
          description="Immediate operational indicators."
          items={[
            {
              title: "API timestamp",
              description: health.timestamp,
              meta: [health.status],
              tone: health.status === "ok" ? "neutral" : "warning",
            },
            {
              title: "Session visibility",
              description:
                sessions.length > 0
                  ? `${sessions.length} active session${sessions.length === 1 ? "" : "s"} visible through the API.`
                  : "No sessions returned yet. Start using the API or Discord gateway to populate this view.",
              meta:
                sessions.length > 0
                  ? [sessions[0]?.channel ?? "unknown"]
                  : undefined,
            },
          ]}
        />
        <DataList
          title="Usage Snapshot"
          description="Current token and cost summary."
          items={[
            {
              title: "Input tokens",
              description: String(usage.inputTokens),
              meta: [`window:${usage.window}`],
            },
            {
              title: "Output tokens",
              description: String(usage.outputTokens),
              meta: [`cost:$${usage.estimatedCost.toFixed(2)}`],
            },
          ]}
        />
      </div>
    </div>
  );
}
