"use client";

import { useState, useTransition } from "react";

import type { SkillDefinition, SkillPackManifest } from "../lib/dashboard-api";
import { importSkillPack } from "../lib/dashboard-api";

export function SkillManager({
  skills,
  packs,
}: {
  skills: SkillDefinition[];
  packs: SkillPackManifest[];
}) {
  const [localPacks, setLocalPacks] = useState(packs);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>Skills</h2>
          <p>
            Built-in filesystem and repo skills plus imported Codex skill packs.
          </p>
        </div>
      </div>

      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const sourceDir = String(formData.get("sourceDir") ?? "").trim();

          if (!sourceDir) {
            setStatus("Enter a local source directory.");
            return;
          }

          startTransition(async () => {
            try {
              const pack = await importSkillPack(sourceDir);
              setLocalPacks((current) => [
                pack,
                ...current.filter((entry) => entry.id !== pack.id),
              ]);
              setStatus(`Imported ${pack.name}.`);
            } catch (error) {
              setStatus(
                error instanceof Error
                  ? error.message
                  : "Failed to import pack.",
              );
            }
          });

          event.currentTarget.reset();
        }}
      >
        <input
          name="sourceDir"
          placeholder="/path/to/codex-skill-pack"
          aria-label="Skill pack source directory"
        />
        <button type="submit" disabled={isPending}>
          {isPending ? "Importing..." : "Import Pack"}
        </button>
      </form>

      <div className="section-grid">
        <div className="panel">
          <h3>Built-in skills</h3>
          <div className="chat-session-list">
            {skills.map((skill) => (
              <div key={skill.id} className="chat-session-item">
                <strong>{skill.id}</strong>
                <span>
                  class {skill.approvalClass} · {skill.summary}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Imported packs</h3>
          <div className="chat-session-list">
            {localPacks.length === 0 ? (
              <div className="empty-state">No imported skill packs yet.</div>
            ) : (
              localPacks.map((pack) => (
                <div key={pack.id} className="chat-session-item">
                  <strong>{pack.name}</strong>
                  <span>
                    {pack.id} · {pack.skills.length} skill
                    {pack.skills.length === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {status ? <p className="form-status">{status}</p> : null}
    </section>
  );
}
