import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import { getApprovals } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const approvals = await getApprovals();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Approvals"
        description="High-risk actions should surface here before they are resumed by the worker."
        chip="Safety"
      />
      <DataList
        title="Approval Inbox"
        description="The API will populate this list as risky tasks enter the waiting state."
        items={approvals.map((approval) => ({
          title: approval.actionName,
          description: approval.reason,
          meta: [approval.status, approval.requestedInChannel],
          tone: approval.status === "pending" ? "warning" : "neutral",
        }))}
      />
    </div>
  );
}
