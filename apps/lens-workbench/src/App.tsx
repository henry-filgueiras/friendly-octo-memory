import { useEffect, useMemo, useRef, useState } from "react";
import type { LensDemoScenario } from "lens-core";
import {
  LensHero,
  LensPanel,
  LensShell,
  LensStatGrid,
  exportScenarioJson,
  lensShellClasses,
  loadLocalScenario,
  readJsonFile,
  saveLocalScenario,
  unwrapScenarioEnvelope,
} from "lens-core";

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

const STORAGE_KEY = "lens-workbench.scenario.v1";

function createEmptyWorkbenchScenario(): WorkbenchScenario {
  return DEMOS[0].scenario;
}

function syncWorkbenchScenario(scenario: WorkbenchScenario): WorkbenchScenario {
  return {
    ...scenario,
    entities: [...scenario.entities],
  };
}

export default function App() {
  const importRef = useRef<HTMLInputElement | null>(null);
  const [scenario, setScenario] = useState<WorkbenchScenario>(() =>
    loadLocalScenario({
      createEmpty: createEmptyWorkbenchScenario,
      storageKey: STORAGE_KEY,
      sync: syncWorkbenchScenario,
    })
  );
  const selectedDemo = useMemo(
    () => DEMOS.find((demo) => demo.scenario.id === scenario.id) ?? DEMOS[0],
    [scenario.id]
  );

  useEffect(() => {
    saveLocalScenario(STORAGE_KEY, scenario);
  }, [scenario]);

  async function handleImport(file: File | null) {
    if (!file) {
      return;
    }

    const parsed = await readJsonFile<WorkbenchScenario | { scenario: WorkbenchScenario }>(file);
    setScenario(syncWorkbenchScenario(unwrapScenarioEnvelope(parsed)));
  }

  return (
    <LensShell>
      <LensHero>
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
                  onClick={() => setScenario(syncWorkbenchScenario(demo.scenario))}
                >
                  <strong>{demo.label}</strong>
                  <span>{demo.description}</span>
                </button>
              ))}
            </div>
            <div className="workbench-actions">
              <button
                type="button"
                className="workbench-button"
                onClick={() => exportScenarioJson("lens-workbench.json", scenario)}
              >
                <strong>Export JSON</strong>
                <span>Exercises the shared download/export helper path.</span>
              </button>
              <button
                type="button"
                className="workbench-button"
                onClick={() => importRef.current?.click()}
              >
                <strong>Import JSON</strong>
                <span>Exercises the shared JSON read path too.</span>
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  try {
                    await handleImport(event.target.files?.[0] ?? null);
                  } finally {
                    event.currentTarget.value = "";
                  }
                }}
              />
            </div>
          </div>
        </div>
      </LensHero>

      <main className={lensShellClasses.workspace}>
        <LensPanel>
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
              <input value={scenario.name} readOnly />
            </label>
            <label className="workbench-field">
              <span>Description</span>
              <textarea rows={4} value={scenario.description} readOnly />
            </label>
          </div>
        </LensPanel>

        <LensPanel>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Analysis</p>
              <h2>What the shell can share safely</h2>
            </div>
            <LensStatGrid>
              <div className={lensShellClasses.statCard}>
                <span>Demo</span>
                <strong>{selectedDemo.label}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Entities</span>
                <strong>{scenario.entities.length}</strong>
              </div>
            </LensStatGrid>
          </div>
          <div className="workbench-stack">
            {scenario.entities.map((entity) => (
              <article key={entity.id} className="workbench-entity">
                <p className={lensShellClasses.eyebrow}>Pane role</p>
                <h3>{entity.name}</h3>
                <p>{entity.signal}</p>
              </article>
            ))}
          </div>
        </LensPanel>

        <LensPanel>
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
        </LensPanel>
      </main>
    </LensShell>
  );
}
