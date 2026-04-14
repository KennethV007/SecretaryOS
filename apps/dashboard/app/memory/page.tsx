import { MemoryInspector } from "../../src/components/memory-inspector";
import { PageHeader } from "../../src/components/page-header";
import { getMemoryItems } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const memoryItems = await getMemoryItems();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Memory"
        description="Inspect durable memory only. Chat transcripts stay in sessions and are not supposed to appear here."
        chip="Recall"
      />
      <MemoryInspector items={memoryItems} />
    </div>
  );
}
