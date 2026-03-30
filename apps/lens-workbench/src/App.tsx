import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LensArtifactEnvelope,
  LensArtifactKind,
  LensRecipe,
  LensTransform,
} from "lens-core";
import {
  LensHero,
  LensPanel,
  LensShell,
  LensStatGrid,
  exportScenarioJson,
  getCompatibleLensTransforms,
  getLensArtifactDefinition,
  getLensRecipe,
  getLensTransformById,
  isLensArtifactEnvelope,
  lensArtifactRegistry,
  lensRecipes,
  lensShellClasses,
  lensTransforms,
  readJsonFile,
} from "lens-core";

type WorkbenchArtifact = {
  [K in LensArtifactKind]: LensArtifactEnvelope<K>;
}[LensArtifactKind];

const SAMPLE_EXECUTION_PLAN_ARTIFACT: LensArtifactEnvelope<"ExecutionPlan"> = {
  id: "artifact-threadline-launch-plan",
  kind: "ExecutionPlan",
  schemaVersion: 1,
  title: "Launch a private beta execution plan",
  createdAt: "2026-03-30T00:00:00.000Z",
  payload: {
    subject: "Launch a private beta",
    deadlineDay: 22,
    projectFinishDay: 20,
    deadlineMissDays: 0,
    tasks: [
      {
        id: "billing",
        name: "Build billing guardrails",
        status: "todo",
        notes: "Prevent accidental paid-plan flows during beta.",
        critical: true,
        constraintIssues: [],
      },
      {
        id: "qa",
        name: "Run beta dry run",
        status: "todo",
        notes: "Walk the signup, invite, and support handoff path end-to-end.",
        critical: true,
        constraintIssues: [
          "Run beta dry run needs to finish by day 18 but currently lands on day 19.",
        ],
      },
      {
        id: "copy",
        name: "Write launch copy",
        status: "todo",
        notes: "Landing page headline, invite email, beta FAQ.",
        critical: false,
        constraintIssues: [],
      },
      {
        id: "scope",
        name: "Lock beta scope",
        status: "done",
        notes: "Decide what is in and out before downstream teams sprint.",
        critical: true,
        constraintIssues: [],
      },
    ],
  },
  provenance: {
    producedBy: {
      app: "Threadline",
    },
    sourceArtifacts: [],
    sourceScenario: {
      app: "Threadline",
      scenarioId: "demo-launch",
      scenarioName: "Launch a private beta",
    },
  },
};

const SAMPLE_CLAIM_SET_ARTIFACT: LensArtifactEnvelope<"ClaimSet"> = {
  id: "artifact-launch-pressure-claims",
  kind: "ClaimSet",
  schemaVersion: 1,
  title: "Launch pressure claims",
  createdAt: "2026-03-30T00:10:00.000Z",
  payload: {
    subject: "Launch a private beta",
    claims: [
      {
        id: "claim-billing",
        statement: "Build billing guardrails is schedule-critical for delivering Launch a private beta.",
        category: "Critical path",
        notes: "Prevent accidental paid-plan flows during beta.",
      },
      {
        id: "claim-qa",
        statement:
          "Run beta dry run is a schedule-critical task with explicit deadline pressure in the current plan for Launch a private beta.",
        category: "Critical deadline pressure",
        notes: "Walk the signup, invite, and support handoff path end-to-end.",
      },
    ],
  },
  provenance: {
    producedBy: {
      app: "lens-workbench",
      transformId: "execution-plan-to-claim-set",
    },
    sourceArtifacts: [
      {
        id: SAMPLE_EXECUTION_PLAN_ARTIFACT.id,
        kind: SAMPLE_EXECUTION_PLAN_ARTIFACT.kind,
        title: SAMPLE_EXECUTION_PLAN_ARTIFACT.title,
      },
    ],
    sourceScenario: {
      app: "Threadline",
      scenarioId: "demo-launch",
      scenarioName: "Launch a private beta",
    },
  },
};

function summarizeArtifactPayload(artifact: WorkbenchArtifact): string[] {
  switch (artifact.kind) {
    case "ExecutionPlan": {
      const criticalCount = artifact.payload.tasks.filter((task) => task.critical).length;
      const constrainedCount = artifact.payload.tasks.filter(
        (task) => task.constraintIssues.length > 0
      ).length;

      return [
        `${artifact.payload.tasks.length} tasks`,
        `${criticalCount} critical`,
        `${constrainedCount} with deadline pressure`,
        `finish day ${artifact.payload.projectFinishDay}`,
      ];
    }
    case "ClaimSet":
      return [
        `${artifact.payload.claims.length} claims`,
        ...artifact.payload.claims.slice(0, 2).map((claim) => claim.category ?? "Uncategorized"),
      ];
    case "EvidenceMap":
      return [
        `${artifact.payload.claims.length} claims`,
        `${artifact.payload.sources.length} sources`,
        `${artifact.payload.links.length} links`,
      ];
    case "DecisionModel":
      return [
        `${artifact.payload.criteria.length} criteria`,
        `${artifact.payload.options.length} options`,
      ];
    case "RankedOptions":
      return [
        `${artifact.payload.ranked.length} ranked`,
        `${artifact.payload.excluded.length} excluded`,
      ];
    case "ProblemFrame":
      return [
        `${artifact.payload.constraints.length} constraints`,
        `${artifact.payload.openQuestions.length} open questions`,
      ];
    case "RecommendationPacket":
      return [
        artifact.payload.summary,
        `${artifact.payload.supportingArtifactIds.length} supporting artifacts`,
      ];
  }
}

function formatProducedBy(artifact: WorkbenchArtifact): string {
  const { app, transformId } = artifact.provenance.producedBy;
  return transformId ? `${app} via ${transformId}` : app;
}

function buildDerivedArtifactTitle(
  artifact: WorkbenchArtifact,
  transform: LensTransform<LensArtifactKind, LensArtifactKind>
): string {
  const output = getLensArtifactDefinition(transform.outputKind)?.label ?? transform.outputKind;
  return `${artifact.title} -> ${output}`;
}

function createArtifactId(kind: LensArtifactKind): string {
  return `artifact-${kind.toLowerCase()}-${Date.now()}`;
}

function findTransformPath(
  startKind: LensArtifactKind,
  targetKind: LensArtifactKind
): Array<LensTransform<LensArtifactKind, LensArtifactKind>> | null {
  if (startKind === targetKind) {
    return [];
  }

  const queue: Array<{
    kind: LensArtifactKind;
    path: Array<LensTransform<LensArtifactKind, LensArtifactKind>>;
  }> = [{ kind: startKind, path: [] }];
  const visited = new Set<LensArtifactKind>([startKind]);

  while (queue.length > 0) {
    const current = queue.shift() as {
      kind: LensArtifactKind;
      path: Array<LensTransform<LensArtifactKind, LensArtifactKind>>;
    };

    for (const transform of lensTransforms.filter((entry) => entry.inputKind === current.kind)) {
      const nextPath = [...current.path, transform];

      if (transform.outputKind === targetKind) {
        return nextPath;
      }

      if (!visited.has(transform.outputKind)) {
        visited.add(transform.outputKind);
        queue.push({
          kind: transform.outputKind,
          path: nextPath,
        });
      }
    }
  }

  return null;
}

function buildLineageLabel(
  transform: LensTransform<LensArtifactKind, LensArtifactKind> | undefined,
  derivedArtifact: WorkbenchArtifact | null
): string {
  if (!transform) {
    return "Choose a compatible transform";
  }

  if (!derivedArtifact) {
    return `${transform.inputKind} -> ${transform.outputKind}`;
  }

  return `${transform.inputKind} -> ${transform.outputKind} -> ${derivedArtifact.kind}`;
}

function formatRecipeChain(recipe: LensRecipe): string {
  const parts: string[] = [recipe.startKind];

  for (const transformId of recipe.transformIds) {
    const transform = getLensTransformById(transformId);

    if (!transform) {
      parts.push(`Missing:${transformId}`);
      continue;
    }

    parts.push(transform.outputKind);
  }

  return parts.join(" -> ");
}

export default function App() {
  const importRef = useRef<HTMLInputElement | null>(null);
  const [currentArtifact, setCurrentArtifact] = useState<WorkbenchArtifact>(
    SAMPLE_EXECUTION_PLAN_ARTIFACT
  );
  const [derivedArtifact, setDerivedArtifact] = useState<WorkbenchArtifact | null>(null);
  const [targetArtifactKind, setTargetArtifactKind] = useState<LensArtifactKind | "">("");
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [completedRecipeSteps, setCompletedRecipeSteps] = useState(0);
  const compatibleTransforms = useMemo(
    () => getCompatibleLensTransforms(currentArtifact.kind),
    [currentArtifact.kind]
  );
  const [selectedTransformId, setSelectedTransformId] = useState<string | null>(
    compatibleTransforms[0]?.id ?? null
  );
  const selectedTransform = compatibleTransforms.find(
    (transform) => transform.id === selectedTransformId
  );
  const targetPath = useMemo(
    () => (targetArtifactKind ? findTransformPath(currentArtifact.kind, targetArtifactKind) : null),
    [currentArtifact.kind, targetArtifactKind]
  );
  const activeRecipe = useMemo(
    () => (activeRecipeId ? getLensRecipe(activeRecipeId) ?? null : null),
    [activeRecipeId]
  );
  const activeRecipeTransforms = useMemo(
    () =>
      activeRecipe
        ? activeRecipe.transformIds
            .map((transformId) => getLensTransformById(transformId))
            .filter((transform): transform is LensTransform<LensArtifactKind, LensArtifactKind> =>
              Boolean(transform)
            )
        : [],
    [activeRecipe]
  );
  const currentRecipeStep = activeRecipeTransforms[completedRecipeSteps];
  const currentRecipeHint = activeRecipe?.stepHints?.[completedRecipeSteps];
  const remainingRecipeTransforms = activeRecipeTransforms.slice(completedRecipeSteps);
  const recipeStepMatchesCurrentArtifact = Boolean(
    currentRecipeStep && currentArtifact.kind === currentRecipeStep.inputKind
  );
  const recipeCanContinueWithDerivedArtifact = Boolean(
    currentRecipeStep &&
      derivedArtifact &&
      derivedArtifact.kind === currentRecipeStep.inputKind &&
      currentArtifact.kind !== currentRecipeStep.inputKind
  );

  useEffect(() => {
    setDerivedArtifact(null);
  }, [currentArtifact]);

  useEffect(() => {
    if (currentRecipeStep && currentArtifact.kind === currentRecipeStep.inputKind) {
      setSelectedTransformId(currentRecipeStep.id);
    } else {
      setSelectedTransformId(compatibleTransforms[0]?.id ?? null);
    }
  }, [currentArtifact, compatibleTransforms, currentRecipeStep]);

  async function handleImport(file: File | null) {
    if (!file) {
      return;
    }

    const parsed = await readJsonFile<unknown>(file);

    if (!isLensArtifactEnvelope(parsed)) {
      window.alert("That file is not a lens artifact envelope.");
      return;
    }

    setCurrentArtifact(parsed as WorkbenchArtifact);
  }

  function handleActivateRecipe(recipe: LensRecipe) {
    setActiveRecipeId(recipe.id);
    setCompletedRecipeSteps(0);
    setTargetArtifactKind(recipe.targetKind);
  }

  function handleClearRecipe() {
    setActiveRecipeId(null);
    setCompletedRecipeSteps(0);
  }

  function handleApplyTransform() {
    if (!selectedTransform) {
      return;
    }

    const now = new Date().toISOString();
    const nextArtifact = selectedTransform.run(currentArtifact as never, {
      artifactId: createArtifactId(selectedTransform.outputKind),
      createdAt: now,
      producedByApp: "lens-workbench",
      title: buildDerivedArtifactTitle(currentArtifact, selectedTransform),
    } as never);

    setDerivedArtifact(nextArtifact as WorkbenchArtifact);

    if (
      currentRecipeStep &&
      selectedTransform.id === currentRecipeStep.id &&
      nextArtifact.kind === currentRecipeStep.outputKind
    ) {
      setCompletedRecipeSteps((value) => value + 1);
    }
  }

  function handleUseNextStepFromTargetPath() {
    if (!targetPath || targetPath.length === 0) {
      return;
    }

    setSelectedTransformId(targetPath[0].id);
  }

  return (
    <LensShell>
      <LensHero>
        <div className={lensShellClasses.heroBody}>
          <p className={lensShellClasses.eyebrow}>Artifact operator bench</p>
          <h1>Artifact Lab</h1>
          <p className="workbench-lede">
            Load a typed artifact, inspect its provenance, apply one explicit transform, and
            export the derived artifact. No runner, no hidden workflow state, no universal schema.
          </p>
          <div className={lensShellClasses.pillRow}>
            <span className={lensShellClasses.pill}>Manual transform lab</span>
            <span className={lensShellClasses.pill}>Typed envelopes</span>
            <span className={lensShellClasses.pill}>Explicit provenance</span>
          </div>
        </div>
        <div className={lensShellClasses.heroActions}>
          <div className="workbench-card">
            <p className={lensShellClasses.eyebrow}>Load artifacts</p>
            <div className="workbench-actions">
              <button
                type="button"
                className={`workbench-button ${
                  currentArtifact.id === SAMPLE_EXECUTION_PLAN_ARTIFACT.id
                    ? "workbench-button--active"
                    : ""
                }`}
                onClick={() => setCurrentArtifact(SAMPLE_EXECUTION_PLAN_ARTIFACT)}
              >
                <strong>Sample ExecutionPlan</strong>
                <span>Demo the real Threadline to ClaimSet handoff path.</span>
              </button>
              <button
                type="button"
                className={`workbench-button ${
                  currentArtifact.id === SAMPLE_CLAIM_SET_ARTIFACT.id
                    ? "workbench-button--active"
                    : ""
                }`}
                onClick={() => setCurrentArtifact(SAMPLE_CLAIM_SET_ARTIFACT)}
              >
                <strong>Sample ClaimSet</strong>
                <span>Continue the chain into an EvidenceMap seed artifact.</span>
              </button>
              <button
                type="button"
                className="workbench-button"
                onClick={() => importRef.current?.click()}
              >
                <strong>Import artifact JSON</strong>
                <span>Load a real exported artifact envelope from a lens app.</span>
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
              <p className={lensShellClasses.eyebrow}>Source Artifact</p>
              <h2>{currentArtifact.title}</h2>
            </div>
            <LensStatGrid>
              <div className={lensShellClasses.statCard}>
                <span>Kind</span>
                <strong>{currentArtifact.kind}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Schema</span>
                <strong>v{currentArtifact.schemaVersion}</strong>
              </div>
            </LensStatGrid>
          </div>

          <div className="workbench-stack">
            <div className="workbench-card">
              <p className={lensShellClasses.eyebrow}>Envelope</p>
              <dl className="artifact-meta">
                <div>
                  <dt>Created</dt>
                  <dd>{currentArtifact.createdAt}</dd>
                </div>
                <div>
                  <dt>Produced by</dt>
                  <dd>{formatProducedBy(currentArtifact)}</dd>
                </div>
                <div>
                  <dt>Source scenario</dt>
                  <dd>
                    {currentArtifact.provenance.sourceScenario
                      ? `${currentArtifact.provenance.sourceScenario.app} / ${
                          currentArtifact.provenance.sourceScenario.scenarioName ??
                          currentArtifact.provenance.sourceScenario.scenarioId ??
                          "Unknown"
                        }`
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Upstream artifacts</dt>
                  <dd>
                    {currentArtifact.provenance.sourceArtifacts.length > 0
                      ? currentArtifact.provenance.sourceArtifacts
                          .map((artifact) => `${artifact.kind}: ${artifact.title}`)
                          .join(", ")
                      : "None"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="workbench-card">
              <p className={lensShellClasses.eyebrow}>Payload summary</p>
              <ul className="workbench-list">
                {summarizeArtifactPayload(currentArtifact).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </LensPanel>

        <LensPanel>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Transform Lab</p>
              <h2>Compatible transforms</h2>
            </div>
            <p className="workbench-note">
              Current real path: <code>ExecutionPlan -&gt; ClaimSet -&gt; EvidenceMap</code>
            </p>
          </div>

          <div className="workbench-stack">
            <div className="workbench-card">
              <div className="recipe-header">
                <div>
                  <p className={lensShellClasses.eyebrow}>Recipe mode</p>
                  <h3 className="workbench-section-title">Named manual workflows</h3>
                </div>
                {activeRecipe ? (
                  <button
                    type="button"
                    className="workbench-button workbench-button--subtle"
                    onClick={handleClearRecipe}
                  >
                    <strong>Exit recipe mode</strong>
                    <span>Return to freeform transform selection only.</span>
                  </button>
                ) : null}
              </div>

              <p className="workbench-note">
                Freeform mode lets you choose any compatible transform. Recipe mode names a real
                handoff path, keeps the next step visible, and still leaves every step manual.
              </p>

              <div className="workbench-actions">
                {lensRecipes.map((recipe) => {
                  const activatable = currentArtifact.kind === recipe.startKind;
                  const isActive = recipe.id === activeRecipe?.id;

                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      className={`workbench-button ${isActive ? "workbench-button--active" : ""}`}
                      onClick={() => handleActivateRecipe(recipe)}
                      disabled={!activatable && !isActive}
                    >
                      <strong>{recipe.label}</strong>
                      <span>{formatRecipeChain(recipe)}</span>
                      <span>
                        {isActive
                          ? "Active recipe"
                          : activatable
                            ? "Start from the current artifact"
                            : `Requires ${recipe.startKind} as the current artifact`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeRecipe ? (
                <div className="recipe-progress">
                  <div className="recipe-progress__summary">
                    <strong>{activeRecipe.label}</strong>
                    <span>
                      {completedRecipeSteps >= activeRecipeTransforms.length
                        ? "Recipe complete"
                        : `Step ${completedRecipeSteps + 1} of ${activeRecipeTransforms.length}`}
                    </span>
                  </div>

                  <div className="recipe-progress__chain">
                    <div className="path-chip">{activeRecipe.startKind}</div>
                    {activeRecipeTransforms.map((transform, index) => (
                      <div key={transform.id} className="path-step">
                        <div className="path-arrow">→</div>
                        <div
                          className={`path-chip path-chip--transform ${
                            index < completedRecipeSteps ? "path-chip--complete" : ""
                          }`}
                        >
                          {transform.name}
                        </div>
                        <div className="path-arrow">→</div>
                        <div
                          className={`path-chip ${
                            index < completedRecipeSteps ? "path-chip--complete" : ""
                          }`}
                        >
                          {transform.outputKind}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="recipe-summary-card">
                    <p className={lensShellClasses.eyebrow}>Transform summary</p>
                    <dl className="recipe-summary-grid">
                      <div>
                        <dt>Current recipe</dt>
                        <dd>{activeRecipe.label}</dd>
                      </div>
                      <div>
                        <dt>Current step</dt>
                        <dd>{currentRecipeStep?.name ?? "Complete"}</dd>
                      </div>
                      <div>
                        <dt>Expected input kind</dt>
                        <dd>{currentRecipeStep?.inputKind ?? activeRecipe.targetKind}</dd>
                      </div>
                      <div>
                        <dt>Expected output kind</dt>
                        <dd>{currentRecipeStep?.outputKind ?? activeRecipe.targetKind}</dd>
                      </div>
                      <div>
                        <dt>Current artifact matches</dt>
                        <dd>
                          {currentRecipeStep
                            ? recipeStepMatchesCurrentArtifact
                              ? "Yes"
                              : "No"
                            : "Done"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {currentRecipeStep ? (
                    <div className="recipe-progress__details">
                      <p className={lensShellClasses.eyebrow}>Current step</p>
                      <strong>{currentRecipeStep.name}</strong>
                      <p className="workbench-note">{currentRecipeStep.description}</p>
                      {currentRecipeHint?.note ? (
                        <p className="workbench-note">
                          <strong>Step note:</strong> {currentRecipeHint.note}
                        </p>
                      ) : null}
                      {currentRecipeHint?.reviewHint ? (
                        <p className="workbench-note">
                          <strong>Review hint:</strong> {currentRecipeHint.reviewHint}
                        </p>
                      ) : null}
                      {recipeStepMatchesCurrentArtifact ? (
                        <p className="workbench-note">
                          The expected next transform is preselected below.
                        </p>
                      ) : (
                        <div className="recipe-alert recipe-alert--paused">
                          <strong>Recipe paused</strong>
                          <span>
                            Waiting for a <code>{currentRecipeStep.inputKind}</code> artifact as
                            the current source before the next manual step can continue.
                          </span>
                          {recipeCanContinueWithDerivedArtifact ? (
                            <span>
                              The derived artifact already matches. Promote it below to continue.
                            </span>
                          ) : (
                            <span>
                              Load or promote the correct artifact kind manually. The lab will not
                              switch it for you.
                            </span>
                          )}
                        </div>
                      )}
                      <p className="workbench-note">
                        Remaining steps:{" "}
                        {remainingRecipeTransforms.map((transform) => transform.outputKind).join(", ")}
                      </p>
                    </div>
                  ) : (
                    <p className="workbench-note">
                      This recipe has reached <code>{activeRecipe.targetKind}</code>. You can still
                      inspect or export the resulting artifact manually.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="workbench-card">
              <p className={lensShellClasses.eyebrow}>Lineage chain</p>
              <div className="lineage-strip" aria-label="Artifact transform lineage">
                <div className="lineage-node">
                  <span className="lineage-node__label">Current artifact</span>
                  <strong>{currentArtifact.kind}</strong>
                  <small>{currentArtifact.title}</small>
                </div>
                <div className="lineage-arrow">→</div>
                <div className="lineage-node lineage-node--transform">
                  <span className="lineage-node__label">Selected transform</span>
                  <strong>{selectedTransform?.name ?? "None selected"}</strong>
                  <small>{buildLineageLabel(selectedTransform, derivedArtifact)}</small>
                </div>
                <div className="lineage-arrow">→</div>
                <div className="lineage-node">
                  <span className="lineage-node__label">Derived artifact</span>
                  <strong>{derivedArtifact?.kind ?? "Pending"}</strong>
                  <small>{derivedArtifact?.title ?? "Apply the transform to derive output"}</small>
                </div>
              </div>
            </div>

            <div className="workbench-card">
              <p className={lensShellClasses.eyebrow}>Path to target</p>
              <label className="workbench-field">
                <span>Optional target artifact kind</span>
                <select
                  value={targetArtifactKind}
                  onChange={(event) =>
                    setTargetArtifactKind(event.target.value as LensArtifactKind | "")
                  }
                >
                  <option value="">No target selected</option>
                  {lensArtifactRegistry.map((entry) => (
                    <option key={entry.kind} value={entry.kind}>
                      {entry.kind}
                    </option>
                  ))}
                </select>
              </label>
              {targetArtifactKind ? (
                targetPath ? (
                  targetPath.length > 0 ? (
                    <>
                      <div className="path-strip" aria-label="Transform path to target artifact">
                        <div className="path-chip">{currentArtifact.kind}</div>
                        {targetPath.map((transform) => (
                          <div key={transform.id} className="path-step">
                            <div className="path-arrow">→</div>
                            <div className="path-chip path-chip--transform">{transform.name}</div>
                            <div className="path-arrow">→</div>
                            <div className="path-chip">{transform.outputKind}</div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="workbench-button workbench-button--subtle"
                        onClick={handleUseNextStepFromTargetPath}
                      >
                        <strong>Use next step toward target</strong>
                        <span>
                          Select <code>{targetPath[0].name}</code> as the next manual transform.
                        </span>
                      </button>
                    </>
                  ) : (
                    <p className="workbench-note">
                      The current artifact is already a <code>{targetArtifactKind}</code>.
                    </p>
                  )
                ) : (
                  <p className="workbench-note">
                    No registered transform path currently reaches <code>{targetArtifactKind}</code>{" "}
                    from <code>{currentArtifact.kind}</code>.
                  </p>
                )
              ) : (
                <p className="workbench-note">
                  Choose a target kind to reveal a simple registered path. Execution is still
                  manual, one transform click per step.
                </p>
              )}
            </div>

            {compatibleTransforms.length === 0 ? (
              <div className="workbench-card">
                <p className="workbench-note">
                  No transforms are registered for <code>{currentArtifact.kind}</code>.
                </p>
              </div>
            ) : (
              compatibleTransforms.map((transform) => (
                <button
                  key={transform.id}
                  type="button"
                  className={`workbench-button ${
                    transform.id === selectedTransformId ? "workbench-button--active" : ""
                  }`}
                  onClick={() => setSelectedTransformId(transform.id)}
                >
                  <strong>
                    {transform.inputKind} -&gt; {transform.outputKind}
                  </strong>
                  <span>{transform.description}</span>
                </button>
              ))
            )}

            <div className="workbench-actions">
              <button
                type="button"
                className="workbench-button"
                onClick={handleApplyTransform}
                disabled={!selectedTransform}
              >
                <strong>Apply selected transform</strong>
                <span>
                  Generate a derived artifact with fresh id, timestamp, and `lens-workbench`
                  provenance.
                </span>
              </button>
              {derivedArtifact ? (
                <button
                  type="button"
                  className={`workbench-button ${
                    recipeCanContinueWithDerivedArtifact ? "workbench-button--promote" : ""
                  }`}
                  onClick={() => setCurrentArtifact(derivedArtifact)}
                >
                  <strong>
                    {recipeCanContinueWithDerivedArtifact
                      ? "Promote derived artifact to continue recipe"
                      : "Use derived artifact as current"}
                  </strong>
                  <span>
                    {recipeCanContinueWithDerivedArtifact
                      ? `Recipe mode is waiting for ${derivedArtifact.kind} as the current source.`
                      : "Promote the derived artifact so you can apply the next compatible step."}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </LensPanel>

        <LensPanel>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Derived Artifact</p>
              <h2>{derivedArtifact ? derivedArtifact.title : "Nothing derived yet"}</h2>
            </div>
          </div>

          <div className="workbench-stack">
            {derivedArtifact ? (
              <>
                <LensStatGrid>
                  <div className={lensShellClasses.statCard}>
                    <span>Kind</span>
                    <strong>{derivedArtifact.kind}</strong>
                  </div>
                  <div className={lensShellClasses.statCard}>
                    <span>Schema</span>
                    <strong>v{derivedArtifact.schemaVersion}</strong>
                  </div>
                </LensStatGrid>

                <div className="workbench-card">
                  <p className={lensShellClasses.eyebrow}>Provenance</p>
                  <dl className="artifact-meta">
                    <div>
                      <dt>Created</dt>
                      <dd>{derivedArtifact.createdAt}</dd>
                    </div>
                    <div>
                      <dt>Produced by</dt>
                      <dd>{formatProducedBy(derivedArtifact)}</dd>
                    </div>
                    <div>
                      <dt>Source artifacts</dt>
                      <dd>
                        {derivedArtifact.provenance.sourceArtifacts
                          .map((artifact) => `${artifact.kind}: ${artifact.title}`)
                          .join(", ")}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="workbench-card">
                  <p className={lensShellClasses.eyebrow}>Payload summary</p>
                  <ul className="workbench-list">
                    {summarizeArtifactPayload(derivedArtifact).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>

                {recipeCanContinueWithDerivedArtifact ? (
                  <div className="recipe-alert recipe-alert--promote">
                    <strong>Manual handoff required</strong>
                    <span>
                      This derived <code>{derivedArtifact.kind}</code> artifact matches the next
                      recipe step, but it is not current yet.
                    </span>
                    <span>
                      Use <code>Promote derived artifact to continue recipe</code> before applying
                      the next transform.
                    </span>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="workbench-button"
                  onClick={() => exportScenarioJson(`${derivedArtifact.kind}.artifact.json`, derivedArtifact)}
                >
                  <strong>Export derived artifact JSON</strong>
                  <span>Save the transformed artifact for import into the next lens.</span>
                </button>
              </>
            ) : (
              <div className="workbench-card">
                <p className="workbench-note">
                  Import or load an artifact, choose a compatible transform, and apply it here.
                </p>
              </div>
            )}
          </div>
        </LensPanel>
      </main>
    </LensShell>
  );
}
