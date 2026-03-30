import type { ChangeEvent, RefObject } from "react";
import type { DemoScenario } from "../data/demos";

interface HeroPanelProps {
  demos: DemoScenario[];
  importInputRef: RefObject<HTMLInputElement>;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onLoadDemo: (demoId: string) => void;
  onStartGuidedDemo: () => void;
}

export function HeroPanel({
  demos,
  importInputRef,
  onExportJson,
  onExportMarkdown,
  onImport,
  onLoadDemo,
  onStartGuidedDemo,
}: HeroPanelProps) {
  return (
    <header className="hero-panel">
      <div className="hero-copy">
        <p className="eyebrow">Local-only evidence instrument</p>
        <h1>Evidence Ledger</h1>
        <p className="hero-copy__lede">
          Map claims to supporting evidence, contradiction, and what is still missing. The goal is
          not to manufacture certainty. It is to make the shape of the uncertainty legible.
        </p>
        <div className="pill-row">
          <span className="pill">No backend</span>
          <span className="pill">No analytics</span>
          <span className="pill">Deterministic evidence scoring</span>
          <span className="pill">Plain-English claim explanations</span>
        </div>
      </div>
      <div className="hero-actions">
        <div className="hero-actions__block">
          <p className="eyebrow">Quick demos</p>
          <div className="demo-list">
            {demos.map((demo) => (
              <button
                type="button"
                key={demo.id}
                className="demo-card"
                onClick={() => onLoadDemo(demo.id)}
              >
                <strong>{demo.label}</strong>
                <span>{demo.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="hero-actions__block">
          <p className="eyebrow">Ledger controls</p>
          <div className="stacked-actions">
            <button type="button" className="tab-button tab-button--active" onClick={onStartGuidedDemo}>
              Walk me through it
            </button>
            <button type="button" className="ghost-button" onClick={onExportJson}>
              Export JSON
            </button>
            <button type="button" className="ghost-button" onClick={onExportMarkdown}>
              Export Markdown
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => importInputRef.current?.click()}
            >
              Import JSON
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onImport}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
