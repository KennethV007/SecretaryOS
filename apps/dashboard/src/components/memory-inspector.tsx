"use client";

import { useMemo, useState } from "react";

import type { MemoryRecord } from "@secretaryos/core";

export function MemoryInspector({ items }: { items: MemoryRecord[] }) {
  const [searchText, setSearchText] = useState("");
  const [kind, setKind] = useState("all");
  const [scope, setScope] = useState("all");
  const [source, setSource] = useState("all");

  const availableKinds = useMemo(
    () => Array.from(new Set(items.map((item) => item.kind))).sort(),
    [items],
  );
  const availableScopes = useMemo(
    () => Array.from(new Set(items.map((item) => item.scope))).sort(),
    [items],
  );
  const availableSources = useMemo(
    () => Array.from(new Set(items.map((item) => item.source))).sort(),
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedText = searchText.trim().toLowerCase();

    return items.filter((item) => {
      if (kind !== "all" && item.kind !== kind) {
        return false;
      }

      if (scope !== "all" && item.scope !== scope) {
        return false;
      }

      if (source !== "all" && item.source !== source) {
        return false;
      }

      if (!normalizedText) {
        return true;
      }

      return [item.content, item.summary]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedText));
    });
  }, [items, kind, scope, source, searchText]);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>Memory Inspector</h2>
          <p>
            Filter durable memory by kind, scope, and source. Session
            transcripts do not belong here.
          </p>
        </div>
      </div>

      <div className="memory-toolbar">
        <div className="memory-filter-grid">
          <label className="memory-filter">
            <span>Search</span>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search promoted memory"
            />
          </label>
          <label className="memory-filter">
            <span>Kind</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">All kinds</option>
              {availableKinds.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="memory-filter">
            <span>Scope</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="all">All scopes</option>
              {availableScopes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="memory-filter">
            <span>Source</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="all">All sources</option>
              {availableSources.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="memory-summary">
          Showing {filteredItems.length} of {items.length} durable memory item
          {items.length === 1 ? "" : "s"}.
        </p>
      </div>

      {filteredItems.length === 0 ? (
        <div className="empty-state">
          No durable memory matched the current filters.
        </div>
      ) : (
        <div className="data-list">
          {filteredItems.map((item) => (
            <article key={item.id} className="data-item">
              <strong>{item.summary ?? `${item.kind} memory`}</strong>
              <div>{item.content}</div>
              <div className="meta-row">
                <span className="pill status-badge" data-tone="neutral">
                  kind:{item.kind}
                </span>
                <span className="pill status-badge" data-tone="neutral">
                  scope:{item.scope}
                </span>
                <span className="pill status-badge" data-tone="neutral">
                  source:{item.source}
                </span>
                {item.personaId ? (
                  <span className="pill status-badge" data-tone="neutral">
                    persona:{item.personaId}
                  </span>
                ) : null}
                {item.projectId ? (
                  <span className="pill status-badge" data-tone="neutral">
                    project:{item.projectId}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
