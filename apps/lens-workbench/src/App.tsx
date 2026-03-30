import { useMemo, useRef, useState } from "react";
import type { LensArtifactKind, LensRecipe, LensTransform } from "lens-core";
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
import {
  appendArtifactLabRunEvent,
  createArtifactLabRunJournal,
  createForkedArtifactLabRunJournal,
  formatArtifactLabRunEvent,
  getArtifactLabCheckpointMap,
  getRecipeTransforms,
  type ArtifactLabRunEventInput,
  type ArtifactLabRunJournal,
  isArtifactLabRunJournal,
  replayArtifactLabRunJournal,
} from "./runJournal";
import {
  SAMPLE_CLAIM_SET_ARTIFACT,
  SAMPLE_EXECUTION_PLAN_ARTIFACT,
  type WorkbenchArtifact,
} from "./sampleArtifacts";

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

function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function upsertRunJournal(
  journals: ArtifactLabRunJournal[],
  nextJournal: ArtifactLabRunJournal
) {
  const existingIndex = journals.findIndex((journal) => journal.sessionId === nextJournal.sessionId);

  if (existingIndex === -1) {
    return [...journals, nextJournal];
  }

  return journals.map((journal, index) => (index === existingIndex ? nextJournal : journal));
}

function describeSession(journal: ArtifactLabRunJournal) {
  const replayed = replayArtifactLabRunJournal(journal);
  return replayed.currentArtifact
    ? `${replayed.currentArtifact.kind}: ${replayed.currentArtifact.title}`
    : journal.sessionId;
}

export default function App() {
  const initialJournal = useMemo(
    () => createArtifactLabRunJournal(SAMPLE_EXECUTION_PLAN_ARTIFACT),
    []
  );
  const artifactImportRef = useRef<HTMLInputElement | null>(null);
  const journalImportRef = useRef<HTMLInputElement | null>(null);
  const [knownRunJournals, setKnownRunJournals] = useState<ArtifactLabRunJournal[]>([
    initialJournal,
  ]);
  const [currentSessionId, setCurrentSessionId] = useState(initialJournal.sessionId);
  const [targetArtifactKind, setTargetArtifactKind] = useState<LensArtifactKind | "">("");
  const [comparisonSessionId, setComparisonSessionId] = useState<string>("");

  const runJournal =
    knownRunJournals.find((journal) => journal.sessionId === currentSessionId) ?? initialJournal;
  const projected = useMemo(() => replayArtifactLabRunJournal(runJournal), [runJournal]);
  const currentArtifact = projected.currentArtifact;
  const derivedArtifact = projected.derivedArtifact;
  const activeRecipe = useMemo(
    () => (projected.activeRecipeId ? getLensRecipe(projected.activeRecipeId) ?? null : null),
    [projected.activeRecipeId]
  );
  const activeRecipeTransforms = useMemo(() => getRecipeTransforms(activeRecipe), [activeRecipe]);
  const currentRecipeStep = activeRecipeTransforms[projected.completedRecipeSteps];
  const currentRecipeHint = activeRecipe?.stepHints?.[projected.completedRecipeSteps];
  const remainingRecipeTransforms = activeRecipeTransforms.slice(projected.completedRecipeSteps);
  const transcriptEntries = useMemo(
    () => runJournal.events.map(formatArtifactLabRunEvent),
    [runJournal]
  );
  const knownSessions = useMemo(
    () =>
      knownRunJournals.map((journal) => ({
        journal,
        replayed: replayArtifactLabRunJournal(journal),
      })),
    [knownRunJournals]
  );
  const checkpointMap = useMemo(() => getArtifactLabCheckpointMap(runJournal), [runJournal]);
  const comparisonCandidates = useMemo(
    () => knownRunJournals.filter((journal) => journal.sessionId !== runJournal.sessionId),
    [knownRunJournals, runJournal.sessionId]
  );
  const effectiveComparisonSessionId =
    comparisonSessionId ||
    (runJournal.forkedFrom?.sessionId &&
    comparisonCandidates.some((journal) => journal.sessionId === runJournal.forkedFrom?.sessionId)
      ? runJournal.forkedFrom.sessionId
      : comparisonCandidates[0]?.sessionId ?? "");
  const comparisonJournal = comparisonCandidates.find(
    (journal) => journal.sessionId === effectiveComparisonSessionId
  );
  const comparisonProjected = comparisonJournal
    ? replayArtifactLabRunJournal(comparisonJournal)
    : null;

  if (!currentArtifact) {
    return (
      <LensShell>
        <LensPanel>
          <p className={lensShellClasses.eyebrow}>Artifact operator bench</p>
          <h1>Artifact Lab</h1>
          <p className="workbench-note">
            This run journal does not replay to a current artifact. Load a valid run journal or
            start a new session from a sample artifact.
          </p>
        </LensPanel>
      </LensShell>
    );
  }

  const compatibleTransforms = getCompatibleLensTransforms(currentArtifact.kind);
  const selectedTransform = compatibleTransforms.find(
    (transform) => transform.id === projected.selectedTransformId
  );
  const targetPath = targetArtifactKind
    ? findTransformPath(currentArtifact.kind, targetArtifactKind)
    : null;
  const recipeStepMatchesCurrentArtifact = Boolean(
    currentRecipeStep && currentArtifact.kind === currentRecipeStep.inputKind
  );
  const recipeCanContinueWithDerivedArtifact = Boolean(
    currentRecipeStep &&
      derivedArtifact &&
      derivedArtifact.kind === currentRecipeStep.inputKind &&
      currentArtifact.kind !== currentRecipeStep.inputKind
  );

  function appendEvent(input: ArtifactLabRunEventInput, at = new Date().toISOString()) {
    setKnownRunJournals((journals) =>
      journals.map((journal) =>
        journal.sessionId === runJournal.sessionId
          ? appendArtifactLabRunEvent(journal, input, at)
          : journal
      )
    );
  }

  function handleLoadArtifact(artifact: WorkbenchArtifact, source: "sample" | "manual" = "sample") {
    appendEvent({
      type: "artifact-loaded",
      artifact,
      source,
    });
  }

  async function handleArtifactImport(file: File | null) {
    if (!file) {
      return;
    }

    const parsed = await readJsonFile<unknown>(file);

    if (!isLensArtifactEnvelope(parsed)) {
      window.alert("That file is not a lens artifact envelope.");
      return;
    }

    appendEvent({
      type: "artifact-imported",
      artifact: parsed as WorkbenchArtifact,
      filename: file.name,
    });
  }

  async function handleJournalImport(file: File | null) {
    if (!file) {
      return;
    }

    const parsed = await readJsonFile<unknown>(file);

    if (!isArtifactLabRunJournal(parsed)) {
      window.alert("That file is not an Artifact Lab run journal.");
      return;
    }

    const replayed = replayArtifactLabRunJournal(parsed);

    if (!replayed.currentArtifact) {
      window.alert("That run journal does not replay to a current artifact.");
      return;
    }

    setKnownRunJournals((journals) => upsertRunJournal(journals, parsed));
    setCurrentSessionId(parsed.sessionId);

    if (replayed.activeRecipeId) {
      const recipe = getLensRecipe(replayed.activeRecipeId);
      setTargetArtifactKind(recipe?.targetKind ?? "");
    } else {
      setTargetArtifactKind("");
    }

    setComparisonSessionId(parsed.forkedFrom?.sessionId ?? "");
  }

  function handleActivateRecipe(recipe: LensRecipe) {
    appendEvent({
      type: "recipe-activated",
      recipeId: recipe.id,
    });
    setTargetArtifactKind(recipe.targetKind);
  }

  function handleClearRecipe() {
    appendEvent({
      type: "recipe-cleared",
    });
  }

  function handleSelectTransform(transformId: string) {
    appendEvent({
      type: "transform-selected",
      transformId,
    });
  }

  function handleApplyTransform() {
    if (!selectedTransform || !currentArtifact) {
      return;
    }

    const now = new Date().toISOString();
    const nextArtifact = selectedTransform.run(currentArtifact as never, {
      artifactId: createArtifactId(selectedTransform.outputKind),
      createdAt: now,
      producedByApp: "lens-workbench",
      title: buildDerivedArtifactTitle(currentArtifact, selectedTransform),
    } as never);

    appendEvent(
      {
        type: "transform-applied",
        transformId: selectedTransform.id,
        outputArtifact: nextArtifact as WorkbenchArtifact,
      },
      now
    );
  }

  function handlePromoteDerivedArtifact() {
    if (!derivedArtifact) {
      return;
    }

    appendEvent({
      type: "derived-artifact-promoted",
      artifact: derivedArtifact,
    });
  }

  function handleUseNextStepFromTargetPath() {
    if (!targetPath || targetPath.length === 0) {
      return;
    }

    handleSelectTransform(targetPath[0].id);
  }

  function handleExportArtifact(artifact: WorkbenchArtifact, source: "current" | "derived") {
    const filename = `${artifact.kind}.artifact.json`;
    exportScenarioJson(filename, artifact);
    appendEvent({
      type: "artifact-exported",
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      artifactTitle: artifact.title,
      filename,
      source,
    });
  }

  function handleExportRunJournal() {
    exportScenarioJson("artifact-lab.run-journal.json", runJournal);
  }

  function handleMarkCheckpoint(targetEventId: string) {
    const suggested = checkpointMap[targetEventId]?.length
      ? `Checkpoint ${checkpointMap[targetEventId]!.length + 1}`
      : "Checkpoint";
    const label = window.prompt("Checkpoint name", suggested)?.trim();

    if (!label) {
      return;
    }

    appendEvent({
      type: "checkpoint-marked",
      targetEventId,
      label,
    });
  }

  function handleForkFromEvent(targetEventId: string) {
    const forkedJournal = createForkedArtifactLabRunJournal(runJournal, targetEventId);
    const replayed = replayArtifactLabRunJournal(forkedJournal);

    setKnownRunJournals((journals) => upsertRunJournal(journals, forkedJournal));
    setCurrentSessionId(forkedJournal.sessionId);
    setComparisonSessionId(runJournal.sessionId);

    if (replayed.activeRecipeId) {
      const recipe = getLensRecipe(replayed.activeRecipeId);
      setTargetArtifactKind(recipe?.targetKind ?? "");
    } else {
      setTargetArtifactKind("");
    }
  }

  function handleSwitchSession(sessionId: string) {
    const nextJournal = knownRunJournals.find((journal) => journal.sessionId === sessionId);

    if (!nextJournal) {
      return;
    }

    const replayed = replayArtifactLabRunJournal(nextJournal);
    setCurrentSessionId(sessionId);
    setComparisonSessionId(nextJournal.forkedFrom?.sessionId ?? "");

    if (replayed.activeRecipeId) {
      const recipe = getLensRecipe(replayed.activeRecipeId);
      setTargetArtifactKind(recipe?.targetKind ?? "");
    } else {
      setTargetArtifactKind("");
    }
  }

  return (
    <LensShell>
      <LensHero>
        <div className={lensShellClasses.heroBody}>
          <p className={lensShellClasses.eyebrow}>Artifact operator bench</p>
          <h1>Artifact Lab</h1>
          <p className="workbench-lede">
            Load a typed artifact, inspect its provenance, apply one explicit transform, and
            export the derived artifact. The run journal records what the human actually did, then
            replays or forks the session deterministically.
          </p>
          <div className={lensShellClasses.pillRow}>
            <span className={lensShellClasses.pill}>Manual transform lab</span>
            <span className={lensShellClasses.pill}>Append-only journal</span>
            <span className={lensShellClasses.pill}>Replayable forks</span>
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
                onClick={() => handleLoadArtifact(SAMPLE_EXECUTION_PLAN_ARTIFACT)}
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
                onClick={() => handleLoadArtifact(SAMPLE_CLAIM_SET_ARTIFACT)}
              >
                <strong>Sample ClaimSet</strong>
                <span>Continue the chain into an EvidenceMap seed artifact.</span>
              </button>
              <button
                type="button"
                className="workbench-button"
                onClick={() => artifactImportRef.current?.click()}
              >
                <strong>Import artifact JSON</strong>
                <span>Load a real exported artifact envelope from a lens app.</span>
              </button>
              <button
                type="button"
                className="workbench-button workbench-button--subtle"
                onClick={() => journalImportRef.current?.click()}
              >
                <strong>Import run journal JSON</strong>
                <span>Replay a saved Artifact Lab session into the current state.</span>
              </button>
              <input
                ref={artifactImportRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  try {
                    await handleArtifactImport(event.target.files?.[0] ?? null);
                  } finally {
                    event.currentTarget.value = "";
                  }
                }}
              />
              <input
                ref={journalImportRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  try {
                    await handleJournalImport(event.target.files?.[0] ?? null);
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
              <p className={lensShellClasses.eyebrow}>Run Browser</p>
              <h2>Known local sessions</h2>
            </div>
            <LensStatGrid>
              <div className={lensShellClasses.statCard}>
                <span>Current session</span>
                <strong>{runJournal.sessionId}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Known runs</span>
                <strong>{knownRunJournals.length}</strong>
              </div>
            </LensStatGrid>
          </div>

          <div className="workbench-stack">
            <div className="workbench-card">
              <p className={lensShellClasses.eyebrow}>Current branch head</p>
              <p className="workbench-note">
                {currentArtifact.kind}: {currentArtifact.title}
              </p>
              <p className="workbench-note">
                Parent / origin:{" "}
                {runJournal.forkedFrom
                  ? `${runJournal.forkedFrom.sessionId} at ${runJournal.forkedFrom.eventId}${
                      runJournal.forkedFrom.checkpointLabel
                        ? ` (${runJournal.forkedFrom.checkpointLabel})`
                        : ""
                    }`
                  : "Root session"}
              </p>
            </div>

            <div className="run-browser-grid">
              {knownSessions.map(({ journal, replayed }) => (
                <button
                  key={journal.sessionId}
                  type="button"
                  className={`run-browser-card ${
                    journal.sessionId === runJournal.sessionId ? "run-browser-card--active" : ""
                  }`}
                  onClick={() => handleSwitchSession(journal.sessionId)}
                >
                  <span className={lensShellClasses.eyebrow}>Session</span>
                  <strong>{journal.sessionId}</strong>
                  <span className="workbench-note">
                    {replayed.currentArtifact
                      ? `${replayed.currentArtifact.kind}: ${replayed.currentArtifact.title}`
                      : "No current artifact"}
                  </span>
                  <span className="workbench-note">Events: {journal.events.length}</span>
                  <span className="workbench-note">
                    Origin:{" "}
                    {journal.forkedFrom
                      ? `${journal.forkedFrom.sessionId} / ${journal.forkedFrom.eventId}`
                      : "Root"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </LensPanel>

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

            <button
              type="button"
              className="workbench-button"
              onClick={() => handleExportArtifact(currentArtifact, "current")}
            >
              <strong>Export current artifact JSON</strong>
              <span>Save the source artifact exactly as it exists in this session.</span>
            </button>
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
                      {projected.completedRecipeSteps >= activeRecipeTransforms.length
                        ? "Recipe complete"
                        : `Step ${projected.completedRecipeSteps + 1} of ${activeRecipeTransforms.length}`}
                    </span>
                  </div>

                  <div className="recipe-progress__chain">
                    <div className="path-chip">{activeRecipe.startKind}</div>
                    {activeRecipeTransforms.map((transform, index) => (
                      <div key={transform.id} className="path-step">
                        <div className="path-arrow">→</div>
                        <div
                          className={`path-chip path-chip--transform ${
                            index < projected.completedRecipeSteps ? "path-chip--complete" : ""
                          }`}
                        >
                          {transform.name}
                        </div>
                        <div className="path-arrow">→</div>
                        <div
                          className={`path-chip ${
                            index < projected.completedRecipeSteps ? "path-chip--complete" : ""
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
                    transform.id === projected.selectedTransformId ? "workbench-button--active" : ""
                  }`}
                  onClick={() => handleSelectTransform(transform.id)}
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
                  onClick={handlePromoteDerivedArtifact}
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
                  onClick={() => handleExportArtifact(derivedArtifact, "derived")}
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

        <LensPanel>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Run Journal</p>
              <h2>Session transcript</h2>
            </div>
            <LensStatGrid>
              <div className={lensShellClasses.statCard}>
                <span>Session</span>
                <strong>{runJournal.sessionId}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Events</span>
                <strong>{runJournal.events.length}</strong>
              </div>
            </LensStatGrid>
          </div>

          <div className="workbench-stack">
            {runJournal.forkedFrom ? (
              <div className="workbench-card">
                <p className={lensShellClasses.eyebrow}>Fork Provenance</p>
                <p className="workbench-note">
                  Forked from <code>{runJournal.forkedFrom.sessionId}</code> at{" "}
                  <code>{runJournal.forkedFrom.eventId}</code>
                  {runJournal.forkedFrom.checkpointLabel
                    ? ` (${runJournal.forkedFrom.checkpointLabel})`
                    : ""}
                  .
                </p>
              </div>
            ) : null}

            <div className="workbench-actions transcript-actions">
              <button
                type="button"
                className="workbench-button"
                onClick={handleExportRunJournal}
              >
                <strong>Export run journal JSON</strong>
                <span>Save the append-only session transcript for replay later.</span>
              </button>
              <button
                type="button"
                className="workbench-button workbench-button--subtle"
                onClick={() => journalImportRef.current?.click()}
              >
                <strong>Load run journal JSON</strong>
                <span>Replay a saved session into the current lab state.</span>
              </button>
            </div>

            <ol className="transcript-list">
              {transcriptEntries.map((entry, index) => (
                <li key={entry.id} className="transcript-item">
                  <div className="transcript-item__meta">
                    <span>{index + 1}.</span>
                    <time dateTime={entry.timestamp}>{formatEventTime(entry.timestamp)}</time>
                    {checkpointMap[entry.id]?.map((label) => (
                      <span key={label} className="transcript-badge">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="transcript-item__body">
                    <strong>{entry.title}</strong>
                    <p>{entry.detail}</p>
                  </div>
                  <div className="transcript-item__actions">
                    <button
                      type="button"
                      className="workbench-button workbench-button--subtle"
                      onClick={() => handleMarkCheckpoint(entry.id)}
                    >
                      <strong>Mark checkpoint</strong>
                      <span>Name this moment so it is easier to fork later.</span>
                    </button>
                    <button
                      type="button"
                      className="workbench-button workbench-button--subtle"
                      onClick={() => handleForkFromEvent(entry.id)}
                    >
                      <strong>Fork from here</strong>
                      <span>Start a new manual session from this replay point.</span>
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </LensPanel>

        <LensPanel>
          <div className={lensShellClasses.panelHeader}>
            <div>
              <p className={lensShellClasses.eyebrow}>Session Comparison</p>
              <h2>Head comparison</h2>
            </div>
          </div>

          <div className="workbench-stack">
            {comparisonCandidates.length > 0 ? (
              <>
                <label className="workbench-field">
                  <span>Compare current session against</span>
                  <select
                    value={effectiveComparisonSessionId}
                    onChange={(event) => setComparisonSessionId(event.target.value)}
                  >
                    {comparisonCandidates.map((journal) => (
                      <option key={journal.sessionId} value={journal.sessionId}>
                        {journal.sessionId} · {describeSession(journal)}
                      </option>
                    ))}
                  </select>
                </label>

                {comparisonJournal && comparisonProjected ? (
                  <div className="comparison-grid">
                    <div className="comparison-card">
                      <p className={lensShellClasses.eyebrow}>Current session</p>
                      <strong>{runJournal.sessionId}</strong>
                      <p className="workbench-note">
                        {currentArtifact.kind}: {currentArtifact.title}
                      </p>
                      <p className="workbench-note">
                        Origin:{" "}
                        {runJournal.forkedFrom
                          ? `${runJournal.forkedFrom.sessionId} / ${runJournal.forkedFrom.eventId}`
                          : "Root"}
                      </p>
                      <ul className="workbench-list">
                        <li>
                          Recipe: {activeRecipe?.label ?? "None"} / {projected.completedRecipeSteps} steps
                        </li>
                        <li>Events: {runJournal.events.length}</li>
                        {summarizeArtifactPayload(currentArtifact).map((line) => (
                          <li key={`current-${line}`}>{line}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="comparison-card">
                      <p className={lensShellClasses.eyebrow}>Comparison session</p>
                      <strong>{comparisonJournal.sessionId}</strong>
                      <p className="workbench-note">
                        {comparisonProjected.currentArtifact
                          ? `${comparisonProjected.currentArtifact.kind}: ${comparisonProjected.currentArtifact.title}`
                          : "No current artifact"}
                      </p>
                      <p className="workbench-note">
                        Origin:{" "}
                        {comparisonJournal.forkedFrom
                          ? `${comparisonJournal.forkedFrom.sessionId} / ${comparisonJournal.forkedFrom.eventId}`
                          : "Root"}
                      </p>
                      <ul className="workbench-list">
                        <li>
                          Recipe:{" "}
                          {comparisonProjected.activeRecipeId
                            ? getLensRecipe(comparisonProjected.activeRecipeId)?.label ??
                              comparisonProjected.activeRecipeId
                            : "None"}{" "}
                          / {comparisonProjected.completedRecipeSteps} steps
                        </li>
                        <li>Events: {comparisonJournal.events.length}</li>
                        {comparisonProjected.currentArtifact
                          ? summarizeArtifactPayload(comparisonProjected.currentArtifact).map((line) => (
                              <li key={`compare-${line}`}>{line}</li>
                            ))
                          : null}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="workbench-card">
                <p className="workbench-note">
                  Fork a run or import another saved journal to compare session heads here.
                </p>
              </div>
            )}
          </div>
        </LensPanel>
      </main>
    </LensShell>
  );
}
