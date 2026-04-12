import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import { getMemoryItems } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const memoryItems = await getMemoryItems();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Memory"
        description="Inspect durable memory surfaced by task execution and retrieval-safe writebacks."
        chip="Recall"
      />
      <DataList
        title="Memory Inspector"
        description="The API returns scoped memory items recorded from completed tasks."
        items={memoryItems.map((item) => ({
          title: item.summary ?? item.kind,
          description: item.content,
          meta: [item.scope, item.source],
        }))}
      />
    </div>
  );
}
