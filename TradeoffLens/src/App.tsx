import { useEffect, useMemo, useRef, useState } from "react";
import { GuidedDemoOverlay, type GuidedDemoStep } from "./components/GuidedDemoOverlay";
import { buildDemoScenarios } from "./data/demos";
import { explainCandidate } from "./domain/explanations";
import {
  clamp,
  cloneCandidate,
  createCandidate,
  createCriterion,
  createEmptyScenario,
  createId,
  formatNumber,
  getDefaultValueForCriterion,
  syncScenario,
  touchScenario,
  updateEnumOptionLabels,
  convertCriterionType,
} from "./domain/helpers";
import { buildMarkdownSummary } from "./domain/markdown";
import {
  analyzeScenario,
  computeParetoFrontier,
  getDominatedIds,
  getDominators,
} from "./domain/scoring";
import type {
  Candidate,
  Criterion,
  CriterionType,
  DecisionScenario,
  EnumCriterion,
  EnumOption,
} from "./domain/types";
import {
  downloadText,
  exportScenarioJson,
  readJsonFile,
  unwrapScenarioEnvelope,
} from "lens-core";
import { loadScenario, saveScenario } from "./utils/storage";

type AnalysisTab = "ranked" | "excluded" | "pairwise" | "frontier";

const DEMOS = buildDemoScenarios();
const GUIDED_DEMO_ID = "selecting-a-tv-show";
const GUIDED_DEMO_NAME = "Selecting a TV show";
const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  {
    analysisTab: "ranked",
    candidateName: "Andor",
    title: "Start with the winner and make the ranking legible.",
    body:
      "This scenario is using hard constraints for season commitment and fully released status. The ranked view shows the surviving options, their weighted scores, and which criteria are doing the heaviest lifting.",
  },
  {
    analysisTab: "excluded",
    candidateName: "Severance",
    title: "Excluded candidates stay visible, with reasons.",
    body:
      "Tradeoff Lens does not quietly drop disqualified options. The excluded view spells out exactly which hard constraints knocked each one out, so the model stays arguable instead of mysterious.",
  },
  {
    analysisTab: "pairwise",
    candidateName: "Detectorists",
    title: "Pairwise comparison shows where the margin really comes from.",
    body:
      "Instead of trusting the top row blindly, this table shows how each eligible option compares head-to-head. Small gaps feel very different from dominance.",
  },
  {
    analysisTab: "frontier",
    candidateName: "Detectorists",
    xCriterionName: "Critical rating",
    yCriterionName: "Season commitment",
    title: "The frontier view makes the tradeoff geometry visible.",
    body:
      "Here the app strips things down to two numeric axes so you can see efficient tradeoffs directly. It is a useful reminder that rankings and frontiers are different lenses on the same decision.",
  },
];

function cloneScenario(scenario: DecisionScenario): DecisionScenario {
  return syncScenario(JSON.parse(JSON.stringify(scenario)) as DecisionScenario);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function rankLookup(ranking: ReturnType<typeof analyzeScenario>["ranking"]): Record<string, number> {
  return Object.fromEntries(ranking.map((entry) => [entry.candidate.id, entry.rank]));
}

function describeAxisDirection(direction: "maximize" | "minimize", name: string): string {
  return direction === "maximize" ? `Higher ${name} is better` : `Lower ${name} is better`;
}

export default function App() {
  const [scenario, setScenario] = useState<DecisionScenario>(() => loadScenario());
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("ranked");
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>({});
  const [frontierXId, setFrontierXId] = useState<string>("");
  const [frontierYId, setFrontierYId] = useState<string>("");
  const importRef = useRef<HTMLInputElement>(null);
  const analysisPanelRef = useRef<HTMLElement | null>(null);
  const [guidedDemoStepIndex, setGuidedDemoStepIndex] = useState<number | null>(null);

  const baseAnalysis = useMemo(() => analyzeScenario(scenario), [scenario]);
  const analysis = useMemo(
    () => analyzeScenario(scenario, weightOverrides),
    [scenario, weightOverrides]
  );
  const scoredCriteria = useMemo(
    () => scenario.criteria.filter((criterion) => criterion.type !== "note"),
    [scenario.criteria]
  );
  const numericCriteria = useMemo(
    () => scenario.criteria.filter((criterion) => criterion.type === "numeric"),
    [scenario.criteria]
  );

  const resolvedSelectedCandidateId =
    selectedCandidateId ??
    scenario.candidates[0]?.id ??
    analysis.ranking[0]?.candidate.id ??
    analysis.excluded[0]?.candidate.id ??
    null;

  const explanation = useMemo(
    () => explainCandidate(scenario, analysis, resolvedSelectedCandidateId),
    [scenario, analysis, resolvedSelectedCandidateId]
  );
  const frontierPoints = useMemo(
    () => computeParetoFrontier(scenario, analysis, frontierXId, frontierYId),
    [scenario, analysis, frontierXId, frontierYId]
  );
  const frontierXCriterion = useMemo(
    () =>
      scenario.criteria.find(
        (criterion): criterion is Extract<Criterion, { type: "numeric" }> =>
          criterion.id === frontierXId && criterion.type === "numeric"
      ) ?? null,
    [scenario.criteria, frontierXId]
  );
  const frontierYCriterion = useMemo(
    () =>
      scenario.criteria.find(
        (criterion): criterion is Extract<Criterion, { type: "numeric" }> =>
          criterion.id === frontierYId && criterion.type === "numeric"
      ) ?? null,
    [scenario.criteria, frontierYId]
  );
  const guidedDemoStep =
    guidedDemoStepIndex !== null ? GUIDED_DEMO_STEPS[guidedDemoStepIndex] : null;

  useEffect(() => {
    saveScenario(scenario);
  }, [scenario]);

  useEffect(() => {
    if (!selectedCandidateId && scenario.candidates[0]) {
      setSelectedCandidateId(scenario.candidates[0].id);
      return;
    }

    if (
      selectedCandidateId &&
      !scenario.candidates.some((candidate) => candidate.id === selectedCandidateId)
    ) {
      setSelectedCandidateId(scenario.candidates[0]?.id ?? null);
    }
  }, [scenario.candidates, selectedCandidateId]);

  useEffect(() => {
    if (numericCriteria.length === 0) {
      setFrontierXId("");
      setFrontierYId("");
      return;
    }

    if (!numericCriteria.some((criterion) => criterion.id === frontierXId)) {
      setFrontierXId(numericCriteria[0].id);
    }

    if (
      !numericCriteria.some((criterion) => criterion.id === frontierYId) ||
      frontierYId === frontierXId
    ) {
      setFrontierYId(numericCriteria[1]?.id ?? numericCriteria[0].id);
    }
  }, [numericCriteria, frontierXId, frontierYId]);

  useEffect(() => {
    if (!guidedDemoStep || scenario.name !== GUIDED_DEMO_NAME) {
      return;
    }

    setAnalysisTab(guidedDemoStep.analysisTab);

    if (guidedDemoStep.candidateName) {
      const focusedCandidate = scenario.candidates.find(
        (candidate) => candidate.name === guidedDemoStep.candidateName
      );

      if (focusedCandidate) {
        setSelectedCandidateId(focusedCandidate.id);
      }
    }

    if (guidedDemoStep.analysisTab === "frontier") {
      const xCriterion = scenario.criteria.find(
        (criterion) => criterion.name === guidedDemoStep.xCriterionName
      );
      const yCriterion = scenario.criteria.find(
        (criterion) => criterion.name === guidedDemoStep.yCriterionName
      );

      if (xCriterion?.type === "numeric") {
        setFrontierXId(xCriterion.id);
      }

      if (yCriterion?.type === "numeric") {
        setFrontierYId(yCriterion.id);
      }
    }
  }, [guidedDemoStep, scenario]);

  useEffect(() => {
    if (!guidedDemoStep || !analysisPanelRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      analysisPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [guidedDemoStep]);

  function updateScenario(updater: (current: DecisionScenario) => DecisionScenario) {
    setScenario((current) => touchScenario(updater(current)));
  }

  function updateCandidate(candidateId: string, updater: (candidate: Candidate) => Candidate) {
    updateScenario((current) => ({
      ...current,
      candidates: current.candidates.map((candidate) =>
        candidate.id === candidateId ? updater(candidate) : candidate
      ),
    }));
  }

  function updateCriterion(criterionId: string, updater: (criterion: Criterion) => Criterion) {
    updateScenario((current) => ({
      ...current,
      criteria: current.criteria.map((criterion) =>
        criterion.id === criterionId ? updater(criterion) : criterion
      ),
    }));
  }

  function handleAddCandidate() {
    updateScenario((current) => ({
      ...current,
      candidates: [...current.candidates, createCandidate(`Candidate ${current.candidates.length + 1}`)],
    }));
  }

  function handleDuplicateCandidate(candidateId: string) {
    const original = scenario.candidates.find((candidate) => candidate.id === candidateId);

    if (!original) {
      return;
    }

    const nextCandidate = cloneCandidate(original);

    updateScenario((current) => ({
      ...current,
      candidates: [...current.candidates, nextCandidate],
    }));
    setSelectedCandidateId(nextCandidate.id);
  }

  function handleDeleteCandidate(candidateId: string) {
    updateScenario((current) => ({
      ...current,
      candidates: current.candidates.filter((candidate) => candidate.id !== candidateId),
    }));
  }

  function handleAddCriterion(type: CriterionType) {
    const nextCriterion = createCriterion(type);

    updateScenario((current) => ({
      ...current,
      criteria: [...current.criteria, nextCriterion],
      candidates: current.candidates.map((candidate) => ({
        ...candidate,
        values: {
          ...candidate.values,
          [nextCriterion.id]: getDefaultValueForCriterion(nextCriterion),
        },
      })),
    }));
  }

  function handleDeleteCriterion(criterionId: string) {
    updateScenario((current) => ({
      ...current,
      criteria: current.criteria.filter((criterion) => criterion.id !== criterionId),
      candidates: current.candidates.map((candidate) => {
        const nextValues = { ...candidate.values };
        delete nextValues[criterionId];
        return {
          ...candidate,
          values: nextValues,
        };
      }),
    }));
    setWeightOverrides((current) => {
      const next = { ...current };
      delete next[criterionId];
      return next;
    });
  }

  function handleCriterionTypeChange(criterionId: string, nextType: CriterionType) {
    const currentCriterion = scenario.criteria.find((criterion) => criterion.id === criterionId);

    if (!currentCriterion || currentCriterion.type === nextType) {
      return;
    }

    const nextCriterion = convertCriterionType(currentCriterion, nextType);

    updateScenario((current) => ({
      ...current,
      criteria: current.criteria.map((criterion) =>
        criterion.id === criterionId ? nextCriterion : criterion
      ),
      candidates: current.candidates.map((candidate) => ({
        ...candidate,
        values: {
          ...candidate.values,
          [criterionId]: getDefaultValueForCriterion(nextCriterion),
        },
      })),
    }));
  }

  function handleUpdateEnumOptions(criterion: EnumCriterion, nextOptions: EnumOption[]) {
    const nextCriterion = updateEnumOptionLabels(criterion, nextOptions);
    const validIds = new Set(nextOptions.map((option) => option.id));

    updateScenario((current) => ({
      ...current,
      criteria: current.criteria.map((entry) =>
        entry.id === criterion.id ? nextCriterion : entry
      ),
      candidates: current.candidates.map((candidate) => {
        const currentValue = candidate.values[criterion.id];
        const nextValue =
          typeof currentValue === "string" && validIds.has(currentValue)
            ? currentValue
            : nextOptions[0]?.id ?? "";

        return {
          ...candidate,
          values: {
            ...candidate.values,
            [criterion.id]: nextValue,
          },
        };
      }),
    }));
  }

  function handleLoadDemo(demo: (typeof DEMOS)[number]) {
    setScenario(cloneScenario(demo.scenario));
    setSelectedCandidateId(demo.scenario.candidates[0]?.id ?? null);
    setWeightOverrides({});
    setAnalysisTab("ranked");
    setGuidedDemoStepIndex(null);
  }

  function handleResetScenario() {
    setScenario(createEmptyScenario());
    setSelectedCandidateId(null);
    setWeightOverrides({});
    setAnalysisTab("ranked");
  }

  function handleExportJson() {
    exportScenarioJson(`${slugify(scenario.name || "tradeoff-lens")}.json`, scenario);
  }

  function handleExportMarkdown() {
    downloadText(
      `${slugify(scenario.name || "tradeoff-lens")}.md`,
      buildMarkdownSummary(scenario, analysis),
      "text/markdown"
    );
  }

  async function handleImportFile(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const parsed = await readJsonFile<DecisionScenario | { scenario: DecisionScenario }>(file);
      const nextScenario = cloneScenario(unwrapScenarioEnvelope(parsed));
      setScenario(nextScenario);
      setSelectedCandidateId(nextScenario.candidates[0]?.id ?? null);
      setWeightOverrides({});
      setGuidedDemoStepIndex(null);
    } catch (error) {
      window.alert("That file does not look like a Tradeoff Lens scenario JSON export.");
    }
  }

  const selectedCandidate = scenario.candidates.find(
    (candidate) => candidate.id === resolvedSelectedCandidateId
  );
  const currentRankLookup = rankLookup(analysis.ranking);
  const baseRankLookup = rankLookup(baseAnalysis.ranking);

  function handleStartGuidedDemo() {
    const demo = DEMOS.find((entry) => entry.id === GUIDED_DEMO_ID);

    if (!demo) {
      return;
    }

    handleLoadDemo(demo);
    setGuidedDemoStepIndex(0);
  }

  function handleAdvanceGuidedDemo() {
    if (guidedDemoStepIndex === null) {
      return;
    }

    if (guidedDemoStepIndex >= GUIDED_DEMO_STEPS.length - 1) {
      setGuidedDemoStepIndex(null);
      return;
    }

    setGuidedDemoStepIndex(guidedDemoStepIndex + 1);
  }

  function handleRewindGuidedDemo() {
    if (guidedDemoStepIndex === null) {
      return;
    }

    setGuidedDemoStepIndex(Math.max(0, guidedDemoStepIndex - 1));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="hero-copy">
          <p className="eyebrow">Local-only browser tool</p>
          <h1>Tradeoff Lens</h1>
          <p className="subtitle">
            Compare options with explicit criteria, weighted scoring, hard
            constraints, and plain-English reasoning instead of a vibe check.
          </p>
          <div className="promise-strip">
            <span className="pill">React + TypeScript + Vite</span>
            <span className="pill">No backend</span>
            <span className="pill">No analytics</span>
            <span className="pill">Local persistence only</span>
          </div>
        </div>

        <div className="topbar-actions">
          <button type="button" className="button button-secondary" onClick={handleStartGuidedDemo}>
            Walk me through it
          </button>
          <button type="button" className="button button-secondary" onClick={handleExportJson}>
            Export JSON
          </button>
          <button type="button" className="button button-secondary" onClick={handleExportMarkdown}>
            Export Markdown
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => importRef.current?.click()}
          >
            Import JSON
          </button>
          <button type="button" className="button button-ghost" onClick={handleResetScenario}>
            Reset
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              handleImportFile(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <section className="demo-strip">
        <div>
          <p className="section-label">Quick-start scenarios</p>
          <h2>Demoable from a cold start</h2>
        </div>
        <div className="demo-buttons">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              className="button button-secondary"
              onClick={() => handleLoadDemo(demo)}
            >
              {demo.label}
            </button>
          ))}
        </div>
      </section>

      <main className="workspace">
        <section className="panel panel-editor">
          <div className="panel-header">
            <div>
              <p className="section-label">Scenario</p>
              <h2>Model Editor</h2>
            </div>
            <div className="stat-strip">
              <span>{scenario.candidates.length} candidates</span>
              <span>{scenario.criteria.length} criteria</span>
            </div>
          </div>

          <label className="field">
            <span>Name</span>
            <input
              value={scenario.name}
              onChange={(event) =>
                updateScenario((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              rows={3}
              value={scenario.description}
              onChange={(event) =>
                updateScenario((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <section className="stack">
            <div className="subsection-header">
              <div>
                <p className="section-label">Candidates</p>
                <h3>Options under consideration</h3>
              </div>
              <button type="button" className="button button-secondary" onClick={handleAddCandidate}>
                Add candidate
              </button>
            </div>

            {scenario.candidates.length === 0 ? (
              <button type="button" className="empty-state-card" onClick={handleAddCandidate}>
                <h4>Add your first candidate</h4>
                <p>
                  Start with a few options, then add criteria to score them on
                  cost, quality, fit, or whatever matters in this decision.
                </p>
              </button>
            ) : (
              <div className="candidate-list">
                {scenario.candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`candidate-chip ${
                      resolvedSelectedCandidateId === candidate.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    <span>{candidate.name}</span>
                    <small>{currentRankLookup[candidate.id] ? `#${currentRankLookup[candidate.id]}` : "Excluded"}</small>
                  </button>
                ))}
              </div>
            )}

            {selectedCandidate ? (
              <article className="editor-card">
                <div className="editor-card-header">
                  <div>
                    <p className="section-label">Selected candidate</p>
                    <h3>{selectedCandidate.name || "Unnamed candidate"}</h3>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => handleDuplicateCandidate(selectedCandidate.id)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="button button-ghost danger"
                      onClick={() => handleDeleteCandidate(selectedCandidate.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span>Candidate name</span>
                  <input
                    value={selectedCandidate.name}
                    onChange={(event) =>
                      updateCandidate(selectedCandidate.id, (candidate) => ({
                        ...candidate,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>General notes</span>
                  <textarea
                    rows={3}
                    value={selectedCandidate.notes}
                    onChange={(event) =>
                      updateCandidate(selectedCandidate.id, (candidate) => ({
                        ...candidate,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="values-grid">
                  {scenario.criteria.map((criterion) => {
                    const value = selectedCandidate.values[criterion.id];

                    return (
                      <label key={criterion.id} className="field">
                        <span>{criterion.name}</span>
                        {criterion.type === "numeric" ? (
                          <input
                            type="number"
                            value={typeof value === "number" ? value : ""}
                            onChange={(event) =>
                              updateCandidate(selectedCandidate.id, (candidate) => ({
                                ...candidate,
                                values: {
                                  ...candidate.values,
                                  [criterion.id]:
                                    event.target.value === ""
                                      ? null
                                      : Number(event.target.value),
                                },
                              }))
                            }
                          />
                        ) : criterion.type === "boolean" ? (
                          <select
                            value={
                              typeof value === "boolean" ? String(value) : ""
                            }
                            onChange={(event) =>
                              updateCandidate(selectedCandidate.id, (candidate) => ({
                                ...candidate,
                                values: {
                                  ...candidate.values,
                                  [criterion.id]:
                                    event.target.value === ""
                                      ? null
                                      : event.target.value === "true",
                                },
                              }))
                            }
                          >
                            <option value="">Unset</option>
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : criterion.type === "enum" ? (
                          <select
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) =>
                              updateCandidate(selectedCandidate.id, (candidate) => ({
                                ...candidate,
                                values: {
                                  ...candidate.values,
                                  [criterion.id]: event.target.value,
                                },
                              }))
                            }
                          >
                            <option value="">Unset</option>
                            {criterion.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <textarea
                            rows={2}
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) =>
                              updateCandidate(selectedCandidate.id, (candidate) => ({
                                ...candidate,
                                values: {
                                  ...candidate.values,
                                  [criterion.id]: event.target.value,
                                },
                              }))
                            }
                          />
                        )}
                        {criterion.type !== "note" ? (
                          <small className="field-help">
                            Weight {weightOverrides[criterion.id] ?? criterion.weight}
                          </small>
                        ) : (
                          <small className="field-help">Freeform note, not scored</small>
                        )}
                      </label>
                    );
                  })}
                </div>
              </article>
            ) : null}
          </section>

          <section className="stack">
            <div className="subsection-header">
              <div>
                <p className="section-label">Criteria</p>
                <h3>Weights and constraints</h3>
              </div>
              <div className="inline-actions wrap">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleAddCriterion("numeric")}
                >
                  Add numeric
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleAddCriterion("boolean")}
                >
                  Add boolean
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleAddCriterion("enum")}
                >
                  Add enum
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleAddCriterion("note")}
                >
                  Add note
                </button>
              </div>
            </div>

            {scenario.criteria.length === 0 ? (
              <div className="empty-panel">
                <p>Add at least one criterion to start scoring candidates.</p>
              </div>
            ) : (
              <div className="criteria-stack">
                {scenario.criteria.map((criterion) => (
                  <article key={criterion.id} className="criterion-card">
                    <div className="criterion-header">
                      <div>
                        <p className="section-label">{criterion.type}</p>
                        <h4>{criterion.name || "Unnamed criterion"}</h4>
                      </div>
                      <button
                        type="button"
                        className="button button-ghost danger"
                        onClick={() => handleDeleteCriterion(criterion.id)}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="criterion-grid">
                      <label className="field">
                        <span>Name</span>
                        <input
                          value={criterion.name}
                          onChange={(event) =>
                            updateCriterion(criterion.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Type</span>
                        <select
                          value={criterion.type}
                          onChange={(event) =>
                            handleCriterionTypeChange(
                              criterion.id,
                              event.target.value as CriterionType
                            )
                          }
                        >
                          <option value="numeric">Numeric</option>
                          <option value="boolean">Boolean</option>
                          <option value="enum">Enum</option>
                          <option value="note">Freeform note</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Weight</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={criterion.weight}
                          disabled={criterion.type === "note"}
                          onChange={(event) =>
                            updateCriterion(criterion.id, (current) => ({
                              ...current,
                              weight: clamp(Number(event.target.value) || 0, 0, 100),
                            }))
                          }
                        />
                      </label>

                      {criterion.type !== "enum" && criterion.type !== "note" ? (
                        <label className="field">
                          <span>Direction</span>
                          <select
                            value={criterion.direction}
                            onChange={(event) =>
                              updateCriterion(criterion.id, (current) => ({
                                ...current,
                                direction: event.target.value as "maximize" | "minimize",
                              }))
                            }
                          >
                            <option value="maximize">Maximize</option>
                            <option value="minimize">Minimize</option>
                          </select>
                        </label>
                      ) : null}
                    </div>

                    {criterion.type === "numeric" ? (
                      <div className="constraint-grid">
                        <label className="toggle-inline">
                          <input
                            type="checkbox"
                            checked={criterion.constraintEnabled}
                            onChange={(event) =>
                              updateCriterion(criterion.id, (current) => ({
                                ...current,
                                constraintEnabled: event.target.checked,
                              }))
                            }
                          />
                          <span>Use as hard constraint</span>
                        </label>

                        <label className="field">
                          <span>Minimum allowed</span>
                          <input
                            type="number"
                            value={criterion.minConstraint ?? ""}
                            disabled={!criterion.constraintEnabled}
                            onChange={(event) =>
                              updateCriterion(criterion.id, (current) => ({
                                ...current,
                                minConstraint:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }))
                            }
                          />
                        </label>

                        <label className="field">
                          <span>Maximum allowed</span>
                          <input
                            type="number"
                            value={criterion.maxConstraint ?? ""}
                            disabled={!criterion.constraintEnabled}
                            onChange={(event) =>
                              updateCriterion(criterion.id, (current) => ({
                                ...current,
                                maxConstraint:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    {criterion.type === "boolean" ? (
                      <div className="constraint-grid">
                        <label className="toggle-inline">
                          <input
                            type="checkbox"
                            checked={criterion.constraintEnabled}
                            onChange={(event) =>
                              updateCriterion(criterion.id, (current) => ({
                                ...current,
                                constraintEnabled: event.target.checked,
                              }))
                            }
                          />
                          <span>Use as hard constraint</span>
                        </label>

                        <label className="field">
                          <span>Required value</span>
                          <select
                            value={String(criterion.requiredValue)}
                            disabled={!criterion.constraintEnabled}
                            onChange={(event) =>
                              updateCriterion(criterion.id, (current) => ({
                                ...current,
                                requiredValue: event.target.value === "true",
                              }))
                            }
                          >
                            <option value="true">Must be true</option>
                            <option value="false">Must be false</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {criterion.type === "enum" ? (
                      <div className="enum-editor">
                        <div className="constraint-grid">
                          <label className="toggle-inline">
                            <input
                              type="checkbox"
                              checked={criterion.constraintEnabled}
                              onChange={(event) =>
                                updateCriterion(criterion.id, (current) => ({
                                  ...current,
                                  constraintEnabled: event.target.checked,
                                }))
                              }
                            />
                            <span>Use as hard constraint</span>
                          </label>
                        </div>

                        {criterion.options.map((option) => (
                          <div key={option.id} className="enum-row">
                            <label className="field">
                              <span>Option</span>
                              <input
                                value={option.label}
                                onChange={(event) =>
                                  handleUpdateEnumOptions(
                                    criterion,
                                    criterion.options.map((entry) =>
                                      entry.id === option.id
                                        ? { ...entry, label: event.target.value }
                                        : entry
                                    )
                                  )
                                }
                              />
                            </label>

                            <label className="field">
                              <span>Score</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={option.score}
                                onChange={(event) =>
                                  handleUpdateEnumOptions(
                                    criterion,
                                    criterion.options.map((entry) =>
                                      entry.id === option.id
                                        ? {
                                            ...entry,
                                            score: clamp(Number(event.target.value) || 0, 0, 100),
                                          }
                                        : entry
                                    )
                                  )
                                }
                              />
                            </label>

                            <label className="toggle-inline compact">
                              <input
                                type="checkbox"
                                checked={criterion.allowedValues.includes(option.id)}
                                disabled={!criterion.constraintEnabled}
                                onChange={(event) =>
                                  updateCriterion(criterion.id, (current) => {
                                    if (current.type !== "enum") {
                                      return current;
                                    }

                                    const allowedValues = event.target.checked
                                      ? [...current.allowedValues, option.id]
                                      : current.allowedValues.filter(
                                          (value) => value !== option.id
                                        );

                                    return {
                                      ...current,
                                      allowedValues,
                                    };
                                  })
                                }
                              />
                              <span>Allowed</span>
                            </label>

                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() =>
                                handleUpdateEnumOptions(
                                  criterion,
                                  criterion.options.filter((entry) => entry.id !== option.id)
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() =>
                            handleUpdateEnumOptions(criterion, [
                              ...criterion.options,
                              {
                                id: createId("option"),
                                label: `Option ${criterion.options.length + 1}`,
                                score: 50,
                              },
                            ])
                          }
                        >
                          Add enum option
                        </button>
                      </div>
                    ) : null}

                    {criterion.type === "note" ? (
                      <p className="field-help">
                        Note criteria let each candidate carry structured text
                        alongside the scored model.
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <section
          ref={analysisPanelRef}
          className={`panel panel-analysis ${guidedDemoStep ? "panel-guided-focus" : ""}`}
        >
          {guidedDemoStep ? (
            <div className="analysis-focus-badge">
              <span className="analysis-focus-badge__dot" aria-hidden="true" />
              Guided demo focus: watch this pane
            </div>
          ) : null}
          <div className="panel-header">
            <div>
              <p className="section-label">Analysis</p>
              <h2>Rankings and diagnostics</h2>
            </div>
            <div className="metric-grid">
              <div className="metric-card">
                <span>Leader</span>
                <strong>{analysis.ranking[0]?.candidate.name ?? "None yet"}</strong>
              </div>
              <div className="metric-card">
                <span>Eligible</span>
                <strong>{analysis.ranking.length}</strong>
              </div>
              <div className="metric-card">
                <span>Excluded</span>
                <strong>{analysis.excluded.length}</strong>
              </div>
              <div className="metric-card">
                <span>Weight total</span>
                <strong>{formatNumber(analysis.totalActiveWeight)}</strong>
              </div>
            </div>
          </div>

          <div className="tab-row">
            {(["ranked", "excluded", "pairwise", "frontier"] as AnalysisTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`tab-button ${analysisTab === tab ? "active" : ""}`}
                onClick={() => setAnalysisTab(tab)}
              >
                {tab === "ranked"
                  ? "Ranked"
                  : tab === "excluded"
                    ? "Excluded"
                    : tab === "pairwise"
                      ? "Pairwise"
                      : "Pareto frontier"}
              </button>
            ))}
          </div>

          {scenario.candidates.length === 0 ? (
            <div className="empty-panel roomy">
              <h3>No scenario yet</h3>
              <p>
                Load a demo or add candidates and criteria on the left. Tradeoff
                Lens stays inspectable: every score comes from visible weights,
                explicit normalization, and deterministic rules.
              </p>
            </div>
          ) : null}

          {analysisTab === "ranked" && scenario.candidates.length > 0 ? (
            <div className="analysis-stack">
              {analysis.ranking.map((entry) => {
                const dominates = getDominatedIds(analysis.dominancePairs, entry.candidate.id);
                const dominatedBy = getDominators(analysis.dominancePairs, entry.candidate.id);
                const strongest = [...entry.contributions]
                  .sort((left, right) => right.weightedPoints - left.weightedPoints)
                  .slice(0, 3);
                const weakest = [...entry.contributions]
                  .sort((left, right) => left.utility - right.utility)
                  .slice(0, 2);

                return (
                  <article key={entry.candidate.id} className="analysis-card">
                    <div className="analysis-card-header">
                      <div>
                        <p className="section-label">Rank #{entry.rank}</p>
                        <h3>{entry.candidate.name}</h3>
                      </div>
                      <div className="score-lockup">
                        <strong>{formatNumber(entry.totalScore)}</strong>
                        <span>weighted score</span>
                      </div>
                    </div>

                    <div className="badge-row">
                      {dominates.length > 0 ? (
                        <span className="badge good">
                          Dominates {dominates.length}
                        </span>
                      ) : null}
                      {dominatedBy.length > 0 ? (
                        <span className="badge warn">
                          Dominated by {dominatedBy.length}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => setSelectedCandidateId(entry.candidate.id)}
                      >
                        Explain
                      </button>
                    </div>

                    <p className="analysis-copy">
                      Strongest contributors:{" "}
                      {strongest.map((item) => `${item.criterionName} (${formatNumber(item.weightedPoints)})`).join(", ") || "none"}.
                      Weakest spots:{" "}
                      {weakest.map((item) => `${item.criterionName} (${formatNumber(item.utility * 100)}%)`).join(", ") || "none"}.
                    </p>

                    <div className="contribution-list">
                      {entry.contributions.map((contribution) => (
                        <div key={contribution.criterionId} className="contribution-row">
                          <div>
                            <strong>{contribution.criterionName}</strong>
                            <small>
                              {contribution.displayValue} • weight {formatNumber(contribution.weight)}
                            </small>
                          </div>
                          <div className="contribution-meter">
                            <span
                              className="contribution-fill"
                              style={{
                                width: `${Math.max(8, contribution.utility * 100)}%`,
                              }}
                            />
                          </div>
                          <span>{formatNumber(contribution.weightedPoints)}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
              {analysis.ranking.length === 0 ? (
                <div className="empty-panel">
                  <p>Every current candidate is excluded by hard constraints.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {analysisTab === "excluded" && scenario.candidates.length > 0 ? (
            <div className="analysis-stack">
              {analysis.excluded.length === 0 ? (
                <div className="empty-panel">
                  <p>No candidates are excluded. Every option currently satisfies the hard constraints.</p>
                </div>
              ) : (
                analysis.excluded.map((entry) => (
                  <article key={entry.candidate.id} className="analysis-card">
                    <div className="analysis-card-header">
                      <div>
                        <p className="section-label">Excluded</p>
                        <h3>{entry.candidate.name}</h3>
                      </div>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => setSelectedCandidateId(entry.candidate.id)}
                      >
                        Inspect
                      </button>
                    </div>
                    <ul className="reason-list">
                      {entry.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          ) : null}

          {analysisTab === "pairwise" && scenario.candidates.length > 0 ? (
            <div className="table-wrap">
              <table className="pairwise-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    {analysis.ranking.map((entry) => (
                      <th key={entry.candidate.id}>{entry.candidate.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.ranking.map((rowEntry) => (
                    <tr key={rowEntry.candidate.id}>
                      <th>{rowEntry.candidate.name}</th>
                      {analysis.ranking.map((columnEntry) => {
                        const cell = analysis.pairwise.find(
                          (entry) =>
                            entry.rowCandidateId === rowEntry.candidate.id &&
                            entry.columnCandidateId === columnEntry.candidate.id
                        );

                        if (!cell) {
                          return <td key={columnEntry.candidate.id}>-</td>;
                        }

                        return (
                          <td
                            key={columnEntry.candidate.id}
                            className={
                              rowEntry.candidate.id === columnEntry.candidate.id
                                ? "self"
                                : cell.delta > 0
                                  ? "win"
                                  : cell.delta < 0
                                    ? "loss"
                                    : ""
                            }
                          >
                            {rowEntry.candidate.id === columnEntry.candidate.id ? (
                              <span>Current</span>
                            ) : (
                              <>
                                <strong>
                                  {cell.delta > 0 ? "+" : ""}
                                  {formatNumber(cell.delta)}
                                </strong>
                                {cell.dominance === "row" ? <small>Dominates</small> : null}
                                {cell.dominance === "column" ? <small>Dominated</small> : null}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {analysisTab === "frontier" && scenario.candidates.length > 0 ? (
            <div className="frontier-panel">
              <div className="frontier-controls">
                <label className="field">
                  <span>X axis</span>
                  <select value={frontierXId} onChange={(event) => setFrontierXId(event.target.value)}>
                    {numericCriteria.map((criterion) => (
                      <option key={criterion.id} value={criterion.id}>
                        {criterion.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Y axis</span>
                  <select value={frontierYId} onChange={(event) => setFrontierYId(event.target.value)}>
                    {numericCriteria.map((criterion) => (
                      <option key={criterion.id} value={criterion.id}>
                        {criterion.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {numericCriteria.length < 2 ? (
                <div className="empty-panel">
                  <p>Add at least two numeric criteria to see a Pareto frontier.</p>
                </div>
              ) : (
                <>
                  <p className="frontier-summary">
                    {frontierXCriterion && frontierYCriterion
                      ? `${describeAxisDirection(frontierXCriterion.direction, frontierXCriterion.name)}. ${describeAxisDirection(frontierYCriterion.direction, frontierYCriterion.name)}.`
                      : "Compare two numeric criteria to see which options sit on the efficient frontier."}
                  </p>
                  <div className="frontier-chart">
                    <div className="frontier-plot">
                      {frontierPoints.map((point) => (
                        <button
                          key={point.candidateId}
                          type="button"
                          className={`frontier-point ${point.onFrontier ? "frontier" : ""} ${
                            resolvedSelectedCandidateId === point.candidateId ? "selected" : ""
                          }`}
                          style={{
                            left: `${point.xUtility * 100}%`,
                            bottom: `${point.yUtility * 100}%`,
                          }}
                          onClick={() => setSelectedCandidateId(point.candidateId)}
                          title={`${point.candidateName}: X ${formatNumber(point.xValue)}, Y ${formatNumber(point.yValue)}`}
                          aria-label={`${point.candidateName}: X ${formatNumber(point.xValue)}, Y ${formatNumber(point.yValue)}`}
                        >
                          <span className="frontier-point-core" />
                        </button>
                      ))}
                    </div>
                    <div className="axis-label axis-x">
                      {frontierXCriterion ? describeAxisDirection(frontierXCriterion.direction, frontierXCriterion.name) : "Better on X"}
                    </div>
                    <div className="axis-label axis-y">
                      {frontierYCriterion ? describeAxisDirection(frontierYCriterion.direction, frontierYCriterion.name) : "Better on Y"}
                    </div>
                  </div>
                  <div className="frontier-legend">
                    {frontierPoints.map((point) => (
                      <div key={point.candidateId} className="legend-row">
                        <span className={`dot ${point.onFrontier ? "frontier" : ""}`} />
                        <strong>{point.candidateName}</strong>
                        <small>
                          X {formatNumber(point.xValue)} • Y {formatNumber(point.yValue)}
                          {point.onFrontier ? " • On frontier" : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>

        <section className="panel panel-explain">
          <div className="panel-header">
            <div>
              <p className="section-label">Explanation</p>
              <h2>Why this ranking happened</h2>
            </div>
          </div>

          <article className="editor-card">
            <h3>{explanation.title}</h3>
            <p className="analysis-copy">{explanation.summary}</p>
            {explanation.excludedReasons.length > 0 ? (
              <ul className="reason-list">
                {explanation.excludedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}

            {explanation.helpedMost.length > 0 ? (
              <div className="bullet-block">
                <strong>Helped most</strong>
                <ul className="reason-list">
                  {explanation.helpedMost.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {explanation.hurtMost.length > 0 ? (
              <div className="bullet-block">
                <strong>Hurt most</strong>
                <ul className="reason-list">
                  {explanation.hurtMost.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="bullet-block">
              <strong>What would need to change</strong>
              <p className="analysis-copy">{explanation.overtakePlan}</p>
            </div>
          </article>

          <section className="stack">
            <div className="subsection-header">
              <div>
                <p className="section-label">Sensitivity</p>
                <h3>Try alternate weights</h3>
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setWeightOverrides({})}
              >
                Reset sliders
              </button>
            </div>

            {scoredCriteria.length === 0 ? (
              <div className="empty-panel">
                <p>Add scored criteria to explore sensitivity analysis.</p>
              </div>
            ) : (
              <>
                <p className="analysis-copy">
                  These sliders only affect the live analysis pane. Your saved
                  scenario weights stay untouched until you edit the criteria
                  themselves.
                </p>

                <div className="sensitivity-list">
                  {scoredCriteria.map((criterion) => (
                    <label key={criterion.id} className="slider-row">
                      <div className="slider-header">
                        <strong>{criterion.name}</strong>
                        <span>
                          {weightOverrides[criterion.id] ?? criterion.weight} / 100
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={weightOverrides[criterion.id] ?? criterion.weight}
                        onChange={(event) =>
                          setWeightOverrides((current) => ({
                            ...current,
                            [criterion.id]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>

                <div className="rank-shift-list">
                  {analysis.ranking.map((entry) => {
                    const baseRank = baseRankLookup[entry.candidate.id];
                    const delta =
                      baseRank !== undefined ? baseRank - entry.rank : 0;

                    return (
                      <div key={entry.candidate.id} className="rank-shift-row">
                        <strong>{entry.candidate.name}</strong>
                        <span>
                          Now #{entry.rank}
                          {delta > 0 ? ` (up ${delta})` : ""}
                          {delta < 0 ? ` (down ${Math.abs(delta)})` : ""}
                          {delta === 0 ? " (unchanged)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </section>
      </main>
      {guidedDemoStep ? (
        <GuidedDemoOverlay
          currentStep={guidedDemoStep}
          isFirstStep={guidedDemoStepIndex === 0}
          isLastStep={guidedDemoStepIndex === GUIDED_DEMO_STEPS.length - 1}
          stepIndex={guidedDemoStepIndex ?? 0}
          totalSteps={GUIDED_DEMO_STEPS.length}
          onClose={() => setGuidedDemoStepIndex(null)}
          onNext={handleAdvanceGuidedDemo}
          onPrevious={handleRewindGuidedDemo}
        />
      ) : null}
    </div>
  );
}
