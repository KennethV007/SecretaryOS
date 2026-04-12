import { DataList } from "../../src/components/data-list";
import { PageHeader } from "../../src/components/page-header";
import { getTasks } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await getTasks();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Tasks"
        description="Task queue visibility across planning, execution, approvals, and completion."
        chip="Operations"
      />
      <DataList
        title="Task List"
        description="Fetched from the API task endpoints with no-store caching."
        items={tasks.map((task) => ({
          title: task.title ?? task.type,
          description: task.input,
          meta: [task.type, task.status],
          tone: task.status === "awaiting_approval" ? "warning" : "neutral",
        }))}
      />
    </div>
  );
}
