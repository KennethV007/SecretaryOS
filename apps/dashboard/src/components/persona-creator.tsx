"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createPersona } from "../lib/dashboard-api";

export function PersonaCreator() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving persona...");

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const enabledInput = form.elements.namedItem(
        "enabled",
      ) as HTMLInputElement | null;

      formData.set("enabled", String(enabledInput?.checked ?? true));
      const markdownSource = formData.get("definitionMarkdownFile");

      if (markdownSource instanceof File && markdownSource.size > 0) {
        const markdownText = await markdownSource.text();
        formData.set("definitionMarkdown", markdownText);

        if (!String(formData.get("fullPrompt") ?? "").trim()) {
          formData.set("fullPrompt", markdownText);
        }
      }

      formData.delete("definitionMarkdownFile");

      const persona = await createPersona(formData);

      setStatus(`Created ${persona.name}.`);
      form.reset();
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to create persona.",
      );
    }
  }

  return (
    <section className="panel persona-creator">
      <div className="section-header">
        <div>
          <h2>Create Persona</h2>
          <p>Persona packs are saved under `data/persona-packs/`.</p>
        </div>
      </div>
      <form className="persona-form" onSubmit={handleSubmit}>
        <label>
          <span>Slug</span>
          <input name="slug" required placeholder="night-operator" />
        </label>
        <label>
          <span>Name</span>
          <input name="name" required placeholder="Night Operator" />
        </label>
        <label className="span-2">
          <span>Description</span>
          <input
            name="description"
            placeholder="Short character summary for the catalog."
          />
        </label>
        <label className="span-2">
          <span>Watered-down prompt</span>
          <textarea
            name="basePrompt"
            required
            rows={5}
            placeholder="Concise persona prompt used for assistant and planner modes."
          />
        </label>
        <label className="span-2">
          <span>Full character prompt</span>
          <textarea
            name="fullPrompt"
            required
            rows={8}
            placeholder="Full prompt used in after-hours mode."
          />
        </label>
        <label className="span-2">
          <span>Character definition markdown</span>
          <textarea
            name="definitionMarkdown"
            rows={8}
            placeholder="Optional markdown source for the character definition."
          />
        </label>
        <label>
          <span>Or upload markdown</span>
          <input
            name="definitionMarkdownFile"
            type="file"
            accept=".md,.markdown,text/markdown"
          />
        </label>
        <label>
          <span>Profile image</span>
          <input name="profileImage" type="file" accept="image/*" />
        </label>
        <label>
          <span>Gallery images</span>
          <input name="galleryImages" type="file" accept="image/*" multiple />
        </label>
        <label>
          <span>Voice</span>
          <input name="voice" placeholder="Direct, warm, concise" />
        </label>
        <label>
          <span>Memory scope</span>
          <select name="memoryScopePolicy" defaultValue="global">
            <option value="global">global</option>
            <option value="persona">persona</option>
            <option value="after_hours_only">after_hours_only</option>
          </select>
        </label>
        <label className="span-2">
          <span>Traits</span>
          <input name="traits" placeholder="grounded, witty, precise" />
        </label>
        <label className="span-2">
          <span>Formatting preferences</span>
          <input
            name="formattingPreferences"
            placeholder="bullet-heavy, concise, no emojis"
          />
        </label>
        <label className="inline-field">
          <input name="enabled" type="checkbox" defaultChecked />
          <span>Enabled</span>
        </label>
        <button type="submit">Create Persona</button>
      </form>
      {status ? <p className="form-status">{status}</p> : null}
    </section>
  );
}
