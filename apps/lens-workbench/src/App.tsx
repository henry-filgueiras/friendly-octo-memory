import { useMemo, useState } from "react";
import type { LensDemoScenario } from "../../../packages/lens-core/src/demos";
import { lensShellClasses } from "../../../packages/lens-core/src/shell";

interface WorkbenchScenario {
  id: string;
  name: string;
  description: string;
  entities: Array<{ id: string; name: string; signal: string }>;
}

const DEMOS: LensDemoScenario<WorkbenchScenario>[] = [
  {
    id: "comparison-lab",
    label: "Comparison lab",
    description: "A fake decision scenario that shows the shared hero and workspace framing.",
    scenario: {
      id: "comparison-lab",
      name: "Comparison lab",
      description: "Hardcoded example proving the extracted shell without inventing a generic engine.",
      entities: [
        { id: "one", name: "Scenario editor", signal: "Left pane owns raw model edits." },
        { id: "two", name: "Analysis surface", signal: "Middle pane is where the derived view lives." },
        { id: "three", name: "Inspector", signal: "Right pane translates state into human meaning." }
      ],
    },
  },
  {
    id: "planning-lab",
    label: "Planning lab",
    description: "A second hardcoded example showing the same chassis with different copy.",
    scenario: {
      id: "planning-lab",
      name: "Planning lab",
      description: "Same shell, different semantics. That is the point of this extraction pass.",
      entities: [
        { id: "one", name: "Shell primitives", signal: "Layout coincidence is real enough to share." },
        { id: "two", name: "Engine semantics", signal: "The actual scoring and scheduling logic is not shared yet." },
        { id: "three", name: "Migration path", signal: "Move utilities first, not the semantic heart." }
      ],
    },
  },
];

export default function App() {
  const [selectedDemoId, setSelectedDemoId] = useState<string>(DEMOS[0].id);
  const selectedDemo = useMemo(
    () => DEMOS.find((demo) => demo.id === selectedDemoId) ?? DEMOS[0],
    [selectedDemoId]
  );

  return (
    <div className={lensShellClasses.app}>
      <header className={lensShellClasses.hero}>
        <div className={lensShellClasses.heroBody}>
          <p className={lensShellClasses.eyebrow}>Shared chassis sandbox</p>
          <h1>Lens Workbench</h1>
          <p className="workbench-lede">
            This tiny app exists to prove the extracted shell and contracts without pretending we
            have a reusable meta-framework already.
          </p>
          <div className={lensShellClasses.pillRow}>
            <span className={lensShellClasses.pill}>Shared shell</span>
            <span className={lensShellClasses.pill}>Shared demo contract</span>
            <span className={lensShellClasses.pill}>No generic engine</span>
          </div>
        </div>
        <div className={lensShellClasses.heroActions}>
          <div className="workbench-card">
            <p className={lensShellClasses.eyebrow}>Demos</p>
            <div className="workbench-demo-list">
              {DEMOS.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  className={`workbench-button ${
                    demo.id === selectedDemo.id ? "workbench-button--active" : ""
                  }`}
                  onClick={() => setSelectedDemoId(demo.id)}
                >
                  <strong>{demo.label}</strong>
                  <span>{demo.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className={lensShellClasses.workspace}>
        <section className={lensShellClasses.panel}>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Editor</p>
              <h2>Shared chassis, local semantics</h2>
            </div>
            <p className="workbench-note">{selectedDemo.scenario.description}</p>
          </div>
          <div className="workbench-card">
            <label className="workbench-field">
              <span>Name</span>
              <input value={selectedDemo.scenario.name} readOnly />
            </label>
            <label className="workbench-field">
              <span>Description</span>
              <textarea rows={4} value={selectedDemo.scenario.description} readOnly />
            </label>
          </div>
        </section>

        <section className={lensShellClasses.panel}>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Analysis</p>
              <h2>What the shell can share safely</h2>
            </div>
            <div className={lensShellClasses.statGrid}>
              <div className={lensShellClasses.statCard}>
                <span>Demo</span>
                <strong>{selectedDemo.label}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Entities</span>
                <strong>{selectedDemo.scenario.entities.length}</strong>
              </div>
            </div>
          </div>
          <div className="workbench-stack">
            {selectedDemo.scenario.entities.map((entity) => (
              <article key={entity.id} className="workbench-entity">
                <p className={lensShellClasses.eyebrow}>Pane role</p>
                <h3>{entity.name}</h3>
                <p>{entity.signal}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={lensShellClasses.panel}>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Inspector</p>
              <h2>What still resists abstraction</h2>
            </div>
          </div>
          <div className="workbench-card">
            <ul className="workbench-list">
              <li>`TradeoffLens` needs ranking, frontier, and sensitivity semantics.</li>
              <li>`Threadline` needs dependency, capacity, and slip-propagation semantics.</li>
              <li>`EvidenceLedger` needs source-independence and contradiction semantics.</li>
              <li>The coincidence is in the frame, not the engine.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
