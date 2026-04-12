import { PageHeader } from "../../src/components/page-header";
import { SkillManager } from "../../src/components/skill-manager";
import { getSkillPacks, getSkills } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const [skills, packs] = await Promise.all([getSkills(), getSkillPacks()]);

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Skills"
        description="Manage built-in skills and imported Codex skill packs."
        chip="Automation"
      />
      <SkillManager skills={skills} packs={packs} />
    </div>
  );
}
