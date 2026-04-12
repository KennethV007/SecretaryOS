import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import {
  getPolicyVersions,
  getPromptVersions,
} from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const [promptVersions, policyVersions] = await Promise.all([
    getPromptVersions(),
    getPolicyVersions(),
  ]);

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Prompts"
        description="Prompt and policy version inventory for governed promotion and rollback."
        chip="Versioning"
      />
      <DataList
        title="Prompt Versions"
        description="Active and inactive prompt revisions by surface."
        items={promptVersions.map((version) => ({
          title: `${version.name} v${version.version}`,
          description: version.scope,
          meta: [version.active ? "active" : "inactive"],
        }))}
      />
      <DataList
        title="Policy Versions"
        description="Routing and memory policy revisions."
        items={policyVersions.map((version) => ({
          title: `Policy v${version.version}`,
          description: version.surface,
          meta: [version.active ? "active" : "inactive"],
        }))}
      />
    </div>
  );
}
