import { formatImportance, formatSourceType } from "../domain/helpers";
import type { Claim, EvidenceLink, EvidenceScenario, Source, SourceType } from "../domain/types";

const SOURCE_TYPES: SourceType[] = [
  "interview",
  "metric",
  "document",
  "log",
  "ticket",
  "benchmark",
  "other",
];

interface EditorPaneProps {
  scenario: EvidenceScenario;
  selectedClaimId: string | null;
  onAddClaim: () => void;
  onAddLink: () => void;
  onAddSource: () => void;
  onDeleteClaim: (claimId: string) => void;
  onDeleteLink: (linkId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onDuplicateClaim: (claimId: string) => void;
  onSelectClaim: (claimId: string) => void;
  onUpdateClaim: (claimId: string, patch: Partial<Claim>) => void;
  onUpdateLink: (linkId: string, patch: Partial<EvidenceLink>) => void;
  onUpdateScenario: (patch: Partial<EvidenceScenario>) => void;
  onUpdateSource: (sourceId: string, patch: Partial<Source>) => void;
}

export function EditorPane({
  scenario,
  selectedClaimId,
  onAddClaim,
  onAddLink,
  onAddSource,
  onDeleteClaim,
  onDeleteLink,
  onDeleteSource,
  onDuplicateClaim,
  onSelectClaim,
  onUpdateClaim,
  onUpdateLink,
  onUpdateScenario,
  onUpdateSource,
}: EditorPaneProps) {
  return (
    <section className="panel panel--editor">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2>Claims and evidence</h2>
        </div>
        <p className="panel-note">Keep the raw model explicit. The analysis only knows what you wire in here.</p>
      </div>

      <div className="meta-card">
        <label className="field">
          <span>Name</span>
          <input
            value={scenario.name}
            onChange={(event) => onUpdateScenario({ name: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            rows={3}
            value={scenario.description}
            onChange={(event) => onUpdateScenario({ description: event.target.value })}
          />
        </label>
      </div>

      <div className="editor-stack">
        <section className="editor-card">
          <div className="editor-card__header">
            <div>
              <p className="eyebrow">Claims</p>
              <strong>{scenario.claims.length}</strong>
            </div>
            <button type="button" className="ghost-button" onClick={onAddClaim}>
              Add claim
            </button>
          </div>
          {scenario.claims.length === 0 ? (
            <p className="empty-copy">Start with the claims you want to pressure-test.</p>
          ) : null}
          <div className="entity-list">
            {scenario.claims.map((claim) => (
              <article
                key={claim.id}
                className={`entity-card ${selectedClaimId === claim.id ? "entity-card--selected" : ""}`}
              >
                <div className="entity-card__toolbar">
                  <button type="button" className="entity-link" onClick={() => onSelectClaim(claim.id)}>
                    {claim.statement}
                  </button>
                  <div className="entity-actions">
                    <button type="button" className="entity-mini" onClick={() => onDuplicateClaim(claim.id)}>
                      Duplicate
                    </button>
                    <button type="button" className="entity-mini" onClick={() => onDeleteClaim(claim.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <label className="field">
                  <span>Statement</span>
                  <input
                    value={claim.statement}
                    onChange={(event) => onUpdateClaim(claim.id, { statement: event.target.value })}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Category</span>
                    <input
                      value={claim.category}
                      onChange={(event) => onUpdateClaim(claim.id, { category: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Importance</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={claim.importance}
                      onChange={(event) =>
                        onUpdateClaim(claim.id, { importance: Number(event.target.value) })
                      }
                    />
                    <small>{formatImportance(claim.importance)}</small>
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={claim.notes}
                    onChange={(event) => onUpdateClaim(claim.id, { notes: event.target.value })}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>

        <section className="editor-card">
          <div className="editor-card__header">
            <div>
              <p className="eyebrow">Sources</p>
              <strong>{scenario.sources.length}</strong>
            </div>
            <button type="button" className="ghost-button" onClick={onAddSource}>
              Add source
            </button>
          </div>
          {scenario.sources.length === 0 ? (
            <p className="empty-copy">Add the artifacts, conversations, or measurements you trust enough to count.</p>
          ) : null}
          <div className="entity-list">
            {scenario.sources.map((source) => (
              <article key={source.id} className="entity-card">
                <div className="entity-card__toolbar">
                  <strong>{source.title}</strong>
                  <button type="button" className="entity-mini" onClick={() => onDeleteSource(source.id)}>
                    Delete
                  </button>
                </div>
                <label className="field">
                  <span>Title</span>
                  <input
                    value={source.title}
                    onChange={(event) => onUpdateSource(source.id, { title: event.target.value })}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Type</span>
                    <select
                      value={source.type}
                      onChange={(event) =>
                        onUpdateSource(source.id, { type: event.target.value as SourceType })
                      }
                    >
                      {SOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {formatSourceType(type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Reliability</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={source.reliability}
                      onChange={(event) =>
                        onUpdateSource(source.id, { reliability: Number(event.target.value) })
                      }
                    />
                    <small>{source.reliability} / 100</small>
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={source.notes}
                    onChange={(event) => onUpdateSource(source.id, { notes: event.target.value })}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>

        <section className="editor-card">
          <div className="editor-card__header">
            <div>
              <p className="eyebrow">Evidence links</p>
              <strong>{scenario.links.length}</strong>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={onAddLink}
              disabled={scenario.claims.length === 0 || scenario.sources.length === 0}
            >
              Add link
            </button>
          </div>
          {scenario.links.length === 0 ? (
            <p className="empty-copy">Bridge claims to sources with explicit support, contradiction, or mention links.</p>
          ) : null}
          <div className="entity-list">
            {scenario.links.map((link) => (
              <article key={link.id} className="entity-card">
                <div className="entity-card__toolbar">
                  <strong>Evidence link</strong>
                  <button type="button" className="entity-mini" onClick={() => onDeleteLink(link.id)}>
                    Delete
                  </button>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Claim</span>
                    <select
                      value={link.claimId}
                      onChange={(event) => onUpdateLink(link.id, { claimId: event.target.value })}
                    >
                      {scenario.claims.map((claim) => (
                        <option key={claim.id} value={claim.id}>
                          {claim.statement}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Source</span>
                    <select
                      value={link.sourceId}
                      onChange={(event) => onUpdateLink(link.id, { sourceId: event.target.value })}
                    >
                      {scenario.sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span>Stance</span>
                    <select
                      value={link.stance}
                      onChange={(event) =>
                        onUpdateLink(link.id, {
                          stance: event.target.value as EvidenceLink["stance"],
                        })
                      }
                    >
                      <option value="supports">Supports</option>
                      <option value="contradicts">Contradicts</option>
                      <option value="mentions">Mentions</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Strength</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={link.strength}
                      onChange={(event) =>
                        onUpdateLink(link.id, { strength: Number(event.target.value) })
                      }
                    />
                    <small>{link.strength} / 100</small>
                  </label>
                  <label className="field">
                    <span>Confidence</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={link.confidence}
                      onChange={(event) =>
                        onUpdateLink(link.id, { confidence: Number(event.target.value) })
                      }
                    />
                    <small>{link.confidence} / 100</small>
                  </label>
                </div>
                <label className="field">
                  <span>Excerpt or note</span>
                  <textarea
                    rows={2}
                    value={link.excerpt}
                    onChange={(event) => onUpdateLink(link.id, { excerpt: event.target.value })}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
