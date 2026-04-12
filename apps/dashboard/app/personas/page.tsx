import { PageHeader } from "../../src/components/page-header";
import { PersonaCreator } from "../../src/components/persona-creator";
import { getPersonas } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function PersonasPage() {
  const personas = await getPersonas();
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Personas"
        description="Personas define character. Modes only choose which prompt variant to use."
        chip="Identity"
      />
      <PersonaCreator />
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Persona Catalog</h2>
            <p>Current character packs exposed by the API.</p>
          </div>
        </div>
        {personas.length === 0 ? (
          <div className="empty-state">No personas available yet.</div>
        ) : (
          <div className="persona-grid">
            {personas.map((persona) => (
              <article key={persona.id} className="persona-card">
                <div className="persona-card-top">
                  {persona.profileImageFileName ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${apiBaseUrl}/personas/${persona.slug}/assets/${persona.profileImageFileName}`}
                      alt={persona.name}
                    />
                  ) : (
                    <div className="persona-avatar-fallback">
                      {persona.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <strong>{persona.name}</strong>
                    <p>{persona.description}</p>
                  </div>
                </div>
                <div className="meta-row">
                  <span className="pill status-badge" data-tone="neutral">
                    {persona.slug}
                  </span>
                  <span className="pill status-badge" data-tone="neutral">
                    {persona.memoryScopePolicy}
                  </span>
                  <span className="pill status-badge" data-tone="neutral">
                    {persona.galleryImageFileNames.length} gallery images
                  </span>
                </div>
                <div className="persona-prompts">
                  <div>
                    <span>Assistant / Planner</span>
                    <p>{persona.basePrompt}</p>
                  </div>
                  <div>
                    <span>After Hours</span>
                    <p>{persona.fullPrompt}</p>
                  </div>
                </div>
                {persona.galleryImageFileNames.length ? (
                  <div className="persona-gallery">
                    {persona.galleryImageFileNames.map((fileName) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={fileName}
                        src={`${apiBaseUrl}/personas/${persona.slug}/assets/${fileName}`}
                        alt={`${persona.name} gallery`}
                      />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
