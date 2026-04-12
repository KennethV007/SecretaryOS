export function DataList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{
    title: string;
    description: string;
    meta?: string[];
    tone?: "neutral" | "warning";
  }>;
}) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">No items available yet.</div>
      ) : (
        <div className="data-list">
          {items.map((item) => (
            <article
              key={`${item.title}-${item.description}`}
              className="data-item"
            >
              <strong>{item.title}</strong>
              <div>{item.description}</div>
              {item.meta?.length ? (
                <div className="meta-row">
                  {item.meta.map((entry) => (
                    <span
                      key={entry}
                      className="pill status-badge"
                      data-tone={item.tone ?? "neutral"}
                    >
                      {entry}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
