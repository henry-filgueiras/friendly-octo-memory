import type { ChangeEvent, RefObject } from "react";
import type { LensDemoScenario } from "lens-core";
import type { ThreadlineScenario } from "../domain/types";

interface HeroPanelProps {
  demos: LensDemoScenario<ThreadlineScenario>[];
  importInputRef: RefObject<HTMLInputElement>;
  onExportExecutionPlanArtifact: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onLoadDemo: (demoId: string) => void;
  onStartGuidedDemo: () => void;
}

export function HeroPanel({
  demos,
  importInputRef,
  onExportExecutionPlanArtifact,
  onExportJson,
  onExportMarkdown,
  onImport,
  onLoadDemo,
  onStartGuidedDemo,
}: HeroPanelProps) {
  return (
    <header className="hero-panel">
      <div className="hero-copy">
        <p className="eyebrow">Local-only planning instrument</p>
        <h1>Threadline</h1>
        <p className="hero-copy__lede">
          Turn a complicated goal into an executable plan by making dependencies, capacity,
          schedule risk, and slip impact visible.
        </p>
        <div className="pill-row">
          <span className="pill">No backend</span>
          <span className="pill">No analytics</span>
          <span className="pill">Deterministic scheduling</span>
          <span className="pill">Critical path and scenario views</span>
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
          <p className="eyebrow">Scenario controls</p>
          <div className="stacked-actions">
            <button type="button" className="tab-button tab-button--active" onClick={onStartGuidedDemo}>
              Walk me through it
            </button>
            <button type="button" className="ghost-button" onClick={onExportJson}>
              Export JSON
            </button>
            <button type="button" className="ghost-button" onClick={onExportExecutionPlanArtifact}>
              Export ExecutionPlan artifact
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
