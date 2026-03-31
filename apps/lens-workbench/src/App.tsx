import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LensArtifactHeadComparison,
  LensArtifactKind,
  LensRecipe,
  LensTransform,
} from "lens-core";
import {
  LensHero,
  LensPanel,
  LensShell,
  LensStatGrid,
  compareLensArtifactHeads,
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
  getArtifactLabCheckpointMap,
  getRecipeTransforms,
  type ArtifactLabRunEventInput,
  isArtifactLabRunJournal,
  replayArtifactLabRunJournal,
} from "./runJournal";
import {
  SAMPLE_CLAIM_SET_ARTIFACT,
  SAMPLE_EXECUTION_PLAN_ARTIFACT,
  type WorkbenchArtifact,
} from "./sampleArtifacts";
import {
  ARTIFACT_LAB_WORKSPACE_STORAGE_KEY,
  createArtifactLabWorkspace,
  loadArtifactLabWorkspaceFromStorage,
  parseArtifactLabWorkspace,
  saveArtifactLabWorkspaceToStorage,
  syncArtifactLabWorkspace,
  type ArtifactLabWorkspace,
} from "./workspace";
import { buildWorkspaceConstellation, getConstellationArtifactColor } from "./constellation";
import { buildWorkflowAtlasProjection, type WorkflowAtlasNode } from "./atlas";

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
  journals: ArtifactLabWorkspace["knownRunJournals"],
  nextJournal: ArtifactLabWorkspace["knownRunJournals"][number]
) {
  const existingIndex = journals.findIndex((journal) => journal.sessionId === nextJournal.sessionId);

  if (existingIndex === -1) {
    return [...journals, nextJournal];
  }

  return journals.map((journal, index) => (index === existingIndex ? nextJournal : journal));
}

function describeSession(workspaceJournal: ArtifactLabWorkspace["knownRunJournals"][number]) {
  const replayed = replayArtifactLabRunJournal(workspaceJournal);
  return replayed.currentArtifact
    ? `${replayed.currentArtifact.kind}: ${replayed.currentArtifact.title}`
    : workspaceJournal.sessionId;
}

interface DiffSummarySection {
  title: string;
  lines: string[];
}

function formatCategory(category?: string) {
  return category || "Uncategorized";
}

function formatDiffReasons(reasons: string[]) {
  return reasons.length > 0 ? ` (${reasons.join("; ")})` : "";
}

function formatAtlasLaneLabel(node: WorkflowAtlasNode) {
  switch (node.eventType) {
    case "artifact-loaded":
    case "artifact-imported":
      return "Current source";
    case "transform-applied":
      return "Derived output";
    case "derived-artifact-promoted":
      return "Promoted current";
    case "artifact-exported":
      return "Export";
    case "recipe-activated":
    case "recipe-cleared":
      return "Recipe";
    case "transform-selected":
      return "Selection";
    case "checkpoint-marked":
      return "Checkpoint";
  }
}

function getAtlasNodeArtifact(node: WorkflowAtlasNode) {
  return node.artifact;
}

function buildDiffSummarySections(comparison: LensArtifactHeadComparison): DiffSummarySection[] {
  switch (comparison.type) {
    case "kind-mismatch":
      return [
        {
          title: "Kind mismatch",
          lines: [
            `Comparison head is ${comparison.beforeKind}; current head is ${comparison.afterKind}. Structured diff is only available for matching artifact kinds.`,
          ],
        },
      ];
    case "unsupported-kind":
      return [
        {
          title: "Diff not yet supported",
          lines: [
            `${comparison.kind} heads can be compared at the metadata level, but there is no lens-aware structured diff for this artifact kind yet.`,
          ],
        },
      ];
    case "ExecutionPlan": {
      const sections: DiffSummarySection[] = [];

      if (comparison.tasksAdded.length > 0) {
        sections.push({
          title: "Tasks added in current head",
          lines: comparison.tasksAdded.map(
            (task) =>
              `${task.name} (${task.status}, ${task.critical ? "critical" : "non-critical"}, ${task.constraintIssueCount} constraint issues)`
          ),
        });
      }

      if (comparison.tasksRemoved.length > 0) {
        sections.push({
          title: "Tasks removed from current head",
          lines: comparison.tasksRemoved.map(
            (task) =>
              `${task.name} (${task.status}, ${task.critical ? "critical" : "non-critical"}, ${task.constraintIssueCount} constraint issues)`
          ),
        });
      }

      if (comparison.criticalityChanges.length > 0) {
        sections.push({
          title: "Criticality changes",
          lines: comparison.criticalityChanges.map(
            (change) =>
              `${change.taskName}: ${change.beforeCritical ? "critical" : "non-critical"} -> ${change.afterCritical ? "critical" : "non-critical"}`
          ),
        });
      }

      if (comparison.constraintIssueChanges.length > 0) {
        sections.push({
          title: "Constraint-issue changes",
          lines: comparison.constraintIssueChanges.map((change) => {
            const parts = [
              change.added.length > 0 ? `+ ${change.added.join("; ")}` : "",
              change.removed.length > 0 ? `- ${change.removed.join("; ")}` : "",
            ].filter(Boolean);

            return `${change.taskName}: ${parts.join("  ")}`;
          }),
        });
      }

      return sections.length > 0
        ? sections
        : [
            {
              title: "No diff detected",
              lines: ["No task-level execution-plan changes were detected between these session heads."],
            },
          ];
    }
    case "ClaimSet": {
      const sections: DiffSummarySection[] = [];

      if (comparison.claimsAdded.length > 0) {
        sections.push({
          title: "Claims added in current head",
          lines: comparison.claimsAdded.map(
            (claim) => `${claim.statement} [${formatCategory(claim.category)}]`
          ),
        });
      }

      if (comparison.claimsRemoved.length > 0) {
        sections.push({
          title: "Claims removed from current head",
          lines: comparison.claimsRemoved.map(
            (claim) => `${claim.statement} [${formatCategory(claim.category)}]`
          ),
        });
      }

      if (comparison.categoryChanges.length > 0) {
        sections.push({
          title: "Claim category changes",
          lines: comparison.categoryChanges.map(
            (change) =>
              `${change.statement}: ${formatCategory(change.beforeCategory)} -> ${formatCategory(change.afterCategory)}`
          ),
        });
      }

      return sections.length > 0
        ? sections
        : [
            {
              title: "No diff detected",
              lines: ["No claim-set changes were detected between these session heads."],
            },
          ];
    }
    case "EvidenceMap": {
      const sections: DiffSummarySection[] = [];
      const coverageLines = [
        comparison.coverage.claims.before !== comparison.coverage.claims.after
          ? `Claims: ${comparison.coverage.claims.before} -> ${comparison.coverage.claims.after}`
          : "",
        comparison.coverage.sources.before !== comparison.coverage.sources.after
          ? `Sources: ${comparison.coverage.sources.before} -> ${comparison.coverage.sources.after}`
          : "",
        comparison.coverage.links.before !== comparison.coverage.links.after
          ? `Links: ${comparison.coverage.links.before} -> ${comparison.coverage.links.after}`
          : "",
        comparison.coverage.linkedClaims.before !== comparison.coverage.linkedClaims.after
          ? `Linked claims: ${comparison.coverage.linkedClaims.before} -> ${comparison.coverage.linkedClaims.after}`
          : "",
        comparison.coverage.uncoveredClaims.before !== comparison.coverage.uncoveredClaims.after
          ? `Uncovered claims: ${comparison.coverage.uncoveredClaims.before} -> ${comparison.coverage.uncoveredClaims.after}`
          : "",
      ].filter(Boolean);

      if (coverageLines.length > 0) {
        sections.push({
          title: "Coverage and count changes",
          lines: coverageLines,
        });
      }

      if (comparison.claimsAdded.length > 0) {
        sections.push({
          title: "Claims added in current head",
          lines: comparison.claimsAdded.map(
            (claim) => `${claim.statement} [${formatCategory(claim.category)}]`
          ),
        });
      }

      if (comparison.claimsRemoved.length > 0) {
        sections.push({
          title: "Claims removed from current head",
          lines: comparison.claimsRemoved.map(
            (claim) => `${claim.statement} [${formatCategory(claim.category)}]`
          ),
        });
      }

      if (comparison.sourcesAdded.length > 0) {
        sections.push({
          title: "Sources added in current head",
          lines: comparison.sourcesAdded.map((source) => source.title),
        });
      }

      if (comparison.sourcesRemoved.length > 0) {
        sections.push({
          title: "Sources removed from current head",
          lines: comparison.sourcesRemoved.map((source) => source.title),
        });
      }

      if (comparison.linksAdded.length > 0) {
        sections.push({
          title: "Links added in current head",
          lines: comparison.linksAdded.map(
            (link) => `${link.claimId} ${link.stance} ${link.sourceId}`
          ),
        });
      }

      if (comparison.linksRemoved.length > 0) {
        sections.push({
          title: "Links removed from current head",
          lines: comparison.linksRemoved.map(
            (link) => `${link.claimId} ${link.stance} ${link.sourceId}`
          ),
        });
      }

      return sections.length > 0
        ? sections
        : [
            {
              title: "No diff detected",
              lines: ["No evidence-map changes were detected between these session heads."],
            },
          ];
    }
    case "RankedOptions": {
      const sections: DiffSummarySection[] = [];

      if (comparison.rankChanges.length > 0) {
        sections.push({
          title: "Rank changes",
          lines: comparison.rankChanges.map(
            (change) =>
              `${change.optionName}: #${change.beforeRank} -> #${change.afterRank}`
          ),
        });
      }

      if (comparison.exclusionsGained.length > 0) {
        sections.push({
          title: "Exclusions gained in current head",
          lines: comparison.exclusionsGained.map(
            (entry) => `${entry.optionName}${formatDiffReasons(entry.reasons)}`
          ),
        });
      }

      if (comparison.exclusionsLost.length > 0) {
        sections.push({
          title: "Exclusions lost from current head",
          lines: comparison.exclusionsLost.map(
            (entry) => `${entry.optionName}${formatDiffReasons(entry.reasons)}`
          ),
        });
      }

      return sections.length > 0
        ? sections
        : [
            {
              title: "No diff detected",
              lines: ["No ranked-option changes were detected between these session heads."],
            },
          ];
    }
  }
}

export default function App() {
  const artifactImportRef = useRef<HTMLInputElement | null>(null);
  const journalImportRef = useRef<HTMLInputElement | null>(null);
  const workspaceImportRef = useRef<HTMLInputElement | null>(null);
  const atlasNodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const transcriptEntryRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [workspace, setWorkspace] = useState<ArtifactLabWorkspace>(() => {
    const persisted = loadArtifactLabWorkspaceFromStorage();

    if (persisted) {
      return persisted;
    }

    return createArtifactLabWorkspace(createArtifactLabRunJournal(SAMPLE_EXECUTION_PLAN_ARTIFACT));
  });

  useEffect(() => {
    saveArtifactLabWorkspaceToStorage(workspace, ARTIFACT_LAB_WORKSPACE_STORAGE_KEY);
  }, [workspace]);

  const { knownRunJournals, currentSessionId, comparisonSessionId, currentTargetArtifactKind = "" } =
    workspace;
  const runJournal =
    knownRunJournals.find((journal) => journal.sessionId === currentSessionId) ?? knownRunJournals[0]!;
  const projected = useMemo(() => replayArtifactLabRunJournal(runJournal), [runJournal]);
  const atlasProjection = useMemo(() => buildWorkflowAtlasProjection(runJournal), [runJournal]);
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
  const transcriptEntries = atlasProjection.transcriptEntries;
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    () => runJournal.events.at(-1)?.id ?? null
  );
  const [observedPathEventIds, setObservedPathEventIds] = useState<string[]>([]);
  const constellation = useMemo(
    () =>
      buildWorkspaceConstellation(
        knownSessions.map(({ journal, replayed }) => ({
          sessionId: journal.sessionId,
          createdAt: journal.createdAt,
          eventCount: journal.events.length,
          forkedFromSessionId: journal.forkedFrom?.sessionId,
          currentArtifactKind: replayed.currentArtifact?.kind,
          currentArtifactTitle: replayed.currentArtifact?.title,
          activeRecipeId: replayed.activeRecipeId,
          completedRecipeSteps: replayed.completedRecipeSteps,
        })),
        currentSessionId,
        effectiveComparisonSessionId,
        workspace.workspaceId
      ),
    [currentSessionId, effectiveComparisonSessionId, knownSessions, workspace.workspaceId]
  );

  function updateWorkspace(transform: (current: ArtifactLabWorkspace) => ArtifactLabWorkspace) {
    setWorkspace((current) => syncArtifactLabWorkspace(transform(current), new Date().toISOString()));
  }

  if (!currentArtifact) {
    return (
      <LensShell>
        <LensPanel>
          <p className={lensShellClasses.eyebrow}>Artifact operator bench</p>
          <h1>Artifact Lab</h1>
          <p className="workbench-note">
            This workspace does not replay to a current artifact. Load a valid workspace or start
            from a sample artifact.
          </p>
        </LensPanel>
      </LensShell>
    );
  }

  const compatibleTransforms = getCompatibleLensTransforms(currentArtifact.kind);
  const selectedTransform = compatibleTransforms.find(
    (transform) => transform.id === projected.selectedTransformId
  );
  const targetArtifactKind = currentTargetArtifactKind || "";
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
  const selectedAtlasNode =
    atlasProjection.nodes.find((node) => node.eventId === selectedEventId) ??
    atlasProjection.nodes.at(-1) ??
    null;
  const observedPathNodes = atlasProjection.nodes.filter((node) =>
    observedPathEventIds.includes(node.eventId)
  );
  const headComparison =
    comparisonProjected?.currentArtifact != null
      ? compareLensArtifactHeads(comparisonProjected.currentArtifact, currentArtifact)
      : null;

  useEffect(() => {
    setSelectedEventId(runJournal.events.at(-1)?.id ?? null);
    setObservedPathEventIds([]);
  }, [runJournal.sessionId]);

  useEffect(() => {
    setObservedPathEventIds((current) =>
      current.filter((eventId) =>
        atlasProjection.nodes.some(
          (node) => node.eventId === eventId && node.eventType === "transform-applied"
        )
      )
    );
  }, [atlasProjection.nodes]);

  function appendEvent(input: ArtifactLabRunEventInput, at = new Date().toISOString()) {
    updateWorkspace((current) => ({
      ...current,
      knownRunJournals: current.knownRunJournals.map((journal) =>
        journal.sessionId === runJournal.sessionId
          ? appendArtifactLabRunEvent(journal, input, at)
          : journal
      ),
    }));
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

    updateWorkspace((current) => ({
      ...current,
      knownRunJournals: upsertRunJournal(current.knownRunJournals, parsed),
      currentSessionId: parsed.sessionId,
      comparisonSessionId: parsed.forkedFrom?.sessionId ?? "",
      currentTargetArtifactKind: replayed.activeRecipeId
        ? getLensRecipe(replayed.activeRecipeId)?.targetKind ?? ""
        : "",
    }));
  }

  async function handleWorkspaceImport(file: File | null) {
    if (!file) {
      return;
    }

    const parsed = await readJsonFile<unknown>(file);
    const importedWorkspace = parseArtifactLabWorkspace(parsed);

    if (!importedWorkspace) {
      window.alert("That file is not a valid Artifact Lab workspace bundle.");
      return;
    }

    setWorkspace(importedWorkspace);
  }

  function handleActivateRecipe(recipe: LensRecipe) {
    appendEvent({
      type: "recipe-activated",
      recipeId: recipe.id,
    });
    updateWorkspace((current) => ({
      ...current,
      currentTargetArtifactKind: recipe.targetKind,
    }));
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

  function handleExportWorkspace() {
    exportScenarioJson("artifact-lab.workspace.json", workspace);
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

    updateWorkspace((current) => ({
      ...current,
      knownRunJournals: upsertRunJournal(current.knownRunJournals, forkedJournal),
      currentSessionId: forkedJournal.sessionId,
      comparisonSessionId: runJournal.sessionId,
      currentTargetArtifactKind: replayed.activeRecipeId
        ? getLensRecipe(replayed.activeRecipeId)?.targetKind ?? ""
        : "",
    }));
  }

  function handleSwitchSession(sessionId: string) {
    const nextJournal = knownRunJournals.find((journal) => journal.sessionId === sessionId);

    if (!nextJournal) {
      return;
    }

    const replayed = replayArtifactLabRunJournal(nextJournal);

    updateWorkspace((current) => ({
      ...current,
      currentSessionId: sessionId,
      comparisonSessionId: nextJournal.forkedFrom?.sessionId ?? "",
      currentTargetArtifactKind: replayed.activeRecipeId
        ? getLensRecipe(replayed.activeRecipeId)?.targetKind ?? ""
        : "",
    }));
  }

  function focusEvent(eventId: string, source: "atlas" | "transcript" | "detail") {
    setSelectedEventId(eventId);

    requestAnimationFrame(() => {
      if (source !== "atlas") {
        atlasNodeRefs.current[eventId]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }

      if (source !== "transcript") {
        transcriptEntryRefs.current[eventId]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    });
  }

  function toggleObservedPathEvent(eventId: string) {
    const targetNode = atlasProjection.nodes.find(
      (node) => node.eventId === eventId && node.eventType === "transform-applied"
    );

    if (!targetNode) {
      return;
    }

    setObservedPathEventIds((current) => {
      if (current.includes(eventId)) {
        return current.filter((entry) => entry !== eventId);
      }

      const next = [...current, eventId];

      return next.sort((left, right) => {
        const leftIndex = atlasProjection.nodes.find((node) => node.eventId === left)?.index ?? 0;
        const rightIndex =
          atlasProjection.nodes.find((node) => node.eventId === right)?.index ?? 0;

        return leftIndex - rightIndex;
      });
    });
  }

  function handlePromoteObservedPath() {
    window.alert(
      "Promote to recipe is still grounded work-in-progress. What's missing: recipe naming, start/target validation, step hints, and a safe way to persist new recipes without pretending the observed path is automatically canonical."
    );
  }

  return (
    <LensShell>
      <LensHero>
        <div className={lensShellClasses.heroBody}>
          <p className={lensShellClasses.eyebrow}>Artifact operator bench</p>
          <h1>Artifact Lab</h1>
          <p className="workbench-lede">
            Load a typed artifact, inspect provenance, apply explicit transforms, and branch
            replayable sessions. The durable local workspace keeps runs, forks, comparison state,
            and target selection together across reloads.
          </p>
          <div className={lensShellClasses.pillRow}>
            <span className={lensShellClasses.pill}>Durable local workspace</span>
            <span className={lensShellClasses.pill}>Replayable runs</span>
            <span className={lensShellClasses.pill}>Manual operator control</span>
          </div>
        </div>
        <div className={`${lensShellClasses.heroActions} workbench-hero-stack`}>
          <div className="workbench-card">
            <p className={lensShellClasses.eyebrow}>Live workspace</p>
            <LensStatGrid>
              <div className={lensShellClasses.statCard}>
                <span>Workspace</span>
                <strong>{workspace.workspaceId}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Session</span>
                <strong>{runJournal.sessionId}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Current head</span>
                <strong>{currentArtifact.kind}</strong>
              </div>
              <div className={lensShellClasses.statCard}>
                <span>Mode</span>
                <strong>{activeRecipe?.label ?? "Freeform"}</strong>
              </div>
            </LensStatGrid>
          </div>

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
                <span>Replay one saved Artifact Lab session into this workspace.</span>
              </button>
              <button
                type="button"
                className="workbench-button workbench-button--subtle"
                onClick={() => workspaceImportRef.current?.click()}
              >
                <strong>Import workspace JSON</strong>
                <span>Replace the current durable local workspace with a saved bundle.</span>
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
              <input
                ref={workspaceImportRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  try {
                    await handleWorkspaceImport(event.target.files?.[0] ?? null);
                  } finally {
                    event.currentTarget.value = "";
                  }
                }}
              />
            </div>
          </div>
        </div>
      </LensHero>

      <main className="workbench-dashboard">
        <div className="workbench-dashboard__column workbench-dashboard__column--nav">
          <LensPanel>
            <div className={lensShellClasses.panelHeader}>
              <div>
                <p className={lensShellClasses.eyebrow}>Navigator</p>
                <h2>Workspace control tower</h2>
              </div>
              <LensStatGrid>
                <div className={lensShellClasses.statCard}>
                  <span>Runs</span>
                  <strong>{workspace.knownRunJournals.length}</strong>
                </div>
                <div className={lensShellClasses.statCard}>
                  <span>Comparison</span>
                  <strong>{effectiveComparisonSessionId || "None"}</strong>
                </div>
              </LensStatGrid>
            </div>

            <div className="workbench-stack">
              <div className="workbench-card">
                <p className={lensShellClasses.eyebrow}>Durable local bundle</p>
                <p className="workbench-note">
                  Sessions, forks, comparison state, and target selection persist together as one
                  local workspace instead of scattering across separate files.
                </p>
                <dl className="artifact-meta">
                  <div>
                    <dt>Workspace</dt>
                    <dd>{workspace.workspaceId}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{workspace.createdAt}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{workspace.updatedAt}</dd>
                  </div>
                  <div>
                    <dt>Current target</dt>
                    <dd>{workspace.currentTargetArtifactKind || "None"}</dd>
                  </div>
                </dl>
              </div>

              <div className="workbench-actions transcript-actions">
                <button
                  type="button"
                  className="workbench-button"
                  onClick={handleExportWorkspace}
                >
                  <strong>Export workspace JSON</strong>
                  <span>Save the full local Artifact Lab workspace with all known runs.</span>
                </button>
                <button
                  type="button"
                  className="workbench-button workbench-button--subtle"
                  onClick={() => workspaceImportRef.current?.click()}
                >
                  <strong>Import workspace JSON</strong>
                  <span>Load a full saved workspace bundle and restore the browser state.</span>
                </button>
              </div>

              <div className="workbench-card">
                <p className={lensShellClasses.eyebrow}>Active session</p>
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
                <p className={lensShellClasses.eyebrow}>Overview</p>
                <h2>Workspace constellation</h2>
              </div>
              <p className="workbench-note">
                The high-level branch map across runs, fork ancestry, and head artifact kinds.
              </p>
            </div>

            <div className="workbench-stack">
              <div className="constellation-shell">
                <svg
                  viewBox={`0 0 ${constellation.width} ${constellation.height}`}
                  className="constellation-svg"
                  role="img"
                  aria-label="Workspace constellation"
                >
                  {constellation.stars.map((star) => (
                    <circle
                      key={star.id}
                      cx={star.x}
                      cy={star.y}
                      r={star.radius}
                      fill="rgba(255, 255, 255, 0.8)"
                      opacity={star.opacity}
                    />
                  ))}

                  {constellation.links.map((link) => (
                    <path
                      key={`${link.fromSessionId}-${link.toSessionId}`}
                      d={link.path}
                      className="constellation-link"
                    />
                  ))}

                  {constellation.nodes.map((node) => (
                    <g
                      key={node.sessionId}
                      className="constellation-node"
                      transform={`translate(${node.x} ${node.y})`}
                      onClick={() => handleSwitchSession(node.sessionId)}
                    >
                      <title>
                        {node.label}: {node.artifactKind ?? "No head"} / {node.eventCount} events
                      </title>
                      {node.isComparison ? (
                        <circle
                          r={node.radius + 10}
                          fill="none"
                          stroke="rgba(103, 184, 216, 0.72)"
                          strokeWidth="2"
                          strokeDasharray="5 5"
                        />
                      ) : null}
                      {node.isCurrent ? (
                        <circle
                          r={node.radius + 16}
                          fill="none"
                          stroke="rgba(225, 132, 59, 0.72)"
                          strokeWidth="3"
                        />
                      ) : null}
                      <circle r={node.radius + 7} fill={node.color} opacity="0.18" />
                      <circle r={node.radius} fill={node.color} />
                      <circle
                        r={Math.max(2.5, node.radius * 0.28)}
                        fill="rgba(255, 255, 255, 0.92)"
                      />
                      <text
                        y={node.radius + 20}
                        textAnchor="middle"
                        className="constellation-node__label"
                      >
                        {node.label}
                      </text>
                      <text
                        y={node.radius + 35}
                        textAnchor="middle"
                        className="constellation-node__meta"
                      >
                        {node.artifactKind ?? "No head"}
                      </text>
                      <text
                        y={node.radius + 49}
                        textAnchor="middle"
                        className="constellation-node__meta"
                      >
                        {node.eventCount} events
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              <div className="constellation-legend">
                <span className="constellation-chip constellation-chip--current">Current run</span>
                {effectiveComparisonSessionId ? (
                  <span className="constellation-chip constellation-chip--comparison">
                    Comparison run
                  </span>
                ) : null}
                {constellation.kindsPresent.map((kind) => (
                  <span className="constellation-chip" key={kind}>
                    <span
                      className="constellation-dot"
                      style={{
                        backgroundColor: getConstellationArtifactColor(kind),
                      }}
                    />
                    {getLensArtifactDefinition(kind)?.label ?? kind}
                  </span>
                ))}
              </div>
            </div>
          </LensPanel>
        </div>

        <div className="workbench-dashboard__column workbench-dashboard__column--projection">
          <LensPanel>
            <div className={lensShellClasses.panelHeader}>
              <div>
                <p className={lensShellClasses.eyebrow}>Run projection</p>
                <h2>Workflow Atlas + transcript</h2>
              </div>
              <p className="workbench-note">
                Atlas and transcript are synchronized projections over the same append-only run
                journal. The journal remains the source of truth.
              </p>
            </div>

            <div className="workbench-stack">
              <div className="workbench-subgrid">
                {runJournal.forkedFrom ? (
                  <div className="workbench-card atlas-origin-card">
                    <p className={lensShellClasses.eyebrow}>Fork origin</p>
                    <strong>{runJournal.forkedFrom.sessionId}</strong>
                    <p className="workbench-note">
                      This run branches from <code>{runJournal.forkedFrom.eventId}</code>
                      {runJournal.forkedFrom.checkpointLabel
                        ? ` (${runJournal.forkedFrom.checkpointLabel})`
                        : ""}{" "}
                      in the parent session.
                    </p>
                  </div>
                ) : null}

                {atlasProjection.activeRecipe ? (
                  <div className="workbench-card atlas-recipe-card">
                    <div className="recipe-progress__summary">
                      <div>
                        <p className={lensShellClasses.eyebrow}>Recipe overlay</p>
                        <strong>{atlasProjection.activeRecipe.recipe.label}</strong>
                      </div>
                      <span>
                        {atlasProjection.activeRecipe.completedSteps} /{" "}
                        {atlasProjection.activeRecipe.recipe.transformIds.length} steps completed
                      </span>
                    </div>
                    <div className="atlas-chip-row">
                      {atlasProjection.activeRecipe.recipe.transformIds.map((transformId, index) => {
                        const transform = getLensTransformById(transformId);
                        const isComplete = index < atlasProjection.activeRecipe!.completedSteps;

                        return (
                          <span
                            key={transformId}
                            className={`path-chip path-chip--transform ${
                              isComplete ? "path-chip--complete" : ""
                            }`}
                          >
                            {transform?.name ?? transformId}
                          </span>
                        );
                      })}
                    </div>
                    {atlasProjection.activeRecipe.remainingTransforms.length > 0 ? (
                      <p className="workbench-note">
                        Remaining in Atlas:{" "}
                        {atlasProjection.activeRecipe.remainingTransforms
                          .map((transform) => transform.name)
                          .join(", ")}
                      </p>
                    ) : (
                      <p className="workbench-note">
                        Atlas shows the active recipe as complete for this run head.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="workbench-card">
                <div className="recipe-header">
                  <div>
                    <p className={lensShellClasses.eyebrow}>Observed transform path</p>
                    <h3 className="workbench-section-title">Path promotion groundwork</h3>
                  </div>
                  <button
                    type="button"
                    className="workbench-button workbench-button--subtle"
                    onClick={handlePromoteObservedPath}
                    disabled={observedPathNodes.length === 0}
                  >
                    <strong>Promote to recipe</strong>
                    <span>
                      Stub only for now. Atlas can mark candidate paths, not author recipes yet.
                    </span>
                  </button>
                </div>
                {observedPathNodes.length > 0 ? (
                  <>
                    <div className="atlas-chip-row">
                      {observedPathNodes.map((node) => (
                        <span key={node.eventId} className="path-chip path-chip--transform">
                          {node.transform?.name ?? node.title}
                        </span>
                      ))}
                    </div>
                    <p className="workbench-note">
                      Missing before promotion becomes real: recipe naming, start/target checks,
                      step hints, and safe persistence.
                    </p>
                  </>
                ) : (
                  <p className="workbench-note">
                    Select one or more observed transform events from Atlas or the transcript to
                    sketch a candidate path.
                  </p>
                )}
              </div>

              <div className="atlas-layout">
                <div className="atlas-scroll">
                  <div
                    className="atlas-columns"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(
                        1,
                        atlasProjection.nodes.length
                      )}, minmax(190px, 1fr))`,
                    }}
                  >
                    {atlasProjection.nodes.map((node) => {
                      const selected = selectedAtlasNode?.eventId === node.eventId;
                      const recipeMatched = Boolean(node.recipeStepMatch);
                      const observed = observedPathEventIds.includes(node.eventId);
                      const hasCurrentState =
                        node.stateAfter.currentArtifact?.id === getAtlasNodeArtifact(node)?.id;
                      const hasDerivedState =
                        node.stateAfter.derivedArtifact?.id === getAtlasNodeArtifact(node)?.id;

                      return (
                        <div className="atlas-column" key={node.eventId}>
                          <div className="atlas-column__meta">
                            <span>#{node.index + 1}</span>
                            <time dateTime={node.timestamp}>{formatEventTime(node.timestamp)}</time>
                          </div>
                          <div className="atlas-column__anchors">
                            {node.checkpointLabels.length > 0 ? (
                              node.checkpointLabels.map((label) => (
                                <span className="transcript-badge" key={`${node.eventId}-${label}`}>
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span className="atlas-anchor-placeholder">No checkpoints</span>
                            )}
                          </div>
                          <button
                            type="button"
                            ref={(element) => {
                              atlasNodeRefs.current[node.eventId] = element;
                            }}
                            className={`atlas-node-card atlas-node-card--${node.lane} ${
                              selected ? "atlas-node-card--selected" : ""
                            } ${recipeMatched ? "atlas-node-card--recipe" : ""} ${
                              observed ? "atlas-node-card--observed" : ""
                            }`}
                            onClick={() => focusEvent(node.eventId, "atlas")}
                          >
                            <span className="atlas-node-card__lane">
                              {formatAtlasLaneLabel(node)}
                            </span>
                            <strong>{node.title}</strong>
                            <span>{node.detail}</span>
                            {node.recipeStepMatch ? (
                              <span className="atlas-node-card__tag">
                                Recipe step {node.recipeStepMatch.stepIndex + 1}
                              </span>
                            ) : null}
                          </button>
                          <div className="atlas-column__state">
                            {hasCurrentState && node.stateAfter.currentArtifact ? (
                              <span className="atlas-state-chip atlas-state-chip--current">
                                Current: {node.stateAfter.currentArtifact.kind}
                              </span>
                            ) : null}
                            {hasDerivedState && node.stateAfter.derivedArtifact ? (
                              <span className="atlas-state-chip atlas-state-chip--derived">
                                Derived: {node.stateAfter.derivedArtifact.kind}
                              </span>
                            ) : null}
                            {node.exportedArtifact ? (
                              <span className="atlas-state-chip">
                                Exported: {node.exportedArtifact.artifactKind}
                              </span>
                            ) : null}
                            {!hasCurrentState && !hasDerivedState && !node.exportedArtifact ? (
                              <span className="atlas-anchor-placeholder">State unchanged</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="atlas-detail-card">
                  {selectedAtlasNode ? (
                    <>
                      <p className={lensShellClasses.eyebrow}>Selected atlas event</p>
                      <strong>{selectedAtlasNode.title}</strong>
                      <p className="workbench-note">{selectedAtlasNode.detail}</p>
                      <dl className="artifact-meta">
                        <div>
                          <dt>Event</dt>
                          <dd>
                            #{selectedAtlasNode.index + 1} / {selectedAtlasNode.eventType}
                          </dd>
                        </div>
                        <div>
                          <dt>Checkpoints</dt>
                          <dd>
                            {selectedAtlasNode.checkpointLabels.length > 0
                              ? selectedAtlasNode.checkpointLabels.join(", ")
                              : "None"}
                          </dd>
                        </div>
                        <div>
                          <dt>Recipe status</dt>
                          <dd>
                            {selectedAtlasNode.recipeStepMatch
                              ? `Completed recipe step ${selectedAtlasNode.recipeStepMatch.stepIndex + 1}`
                              : atlasProjection.activeRecipe
                                ? "Not on the completed recipe path"
                                : "No active recipe"}
                          </dd>
                        </div>
                        <div>
                          <dt>State after event</dt>
                          <dd>
                            Current: {selectedAtlasNode.stateAfter.currentArtifact?.kind ?? "None"}{" "}
                            / Derived: {selectedAtlasNode.stateAfter.derivedArtifact?.kind ?? "None"}
                          </dd>
                        </div>
                      </dl>

                      {getAtlasNodeArtifact(selectedAtlasNode) ? (
                        <div className="workbench-card">
                          <p className={lensShellClasses.eyebrow}>Artifact details</p>
                          <p className="workbench-note">
                            {getAtlasNodeArtifact(selectedAtlasNode)!.kind}:{" "}
                            {getAtlasNodeArtifact(selectedAtlasNode)!.title}
                          </p>
                          <p className="workbench-note">
                            Produced by {formatProducedBy(getAtlasNodeArtifact(selectedAtlasNode)!)}
                          </p>
                        </div>
                      ) : null}

                      <div className="workbench-actions">
                        <button
                          type="button"
                          className="workbench-button workbench-button--subtle"
                          onClick={() => handleMarkCheckpoint(selectedAtlasNode.eventId)}
                        >
                          <strong>Mark checkpoint</strong>
                          <span>Name this event as a reusable anchor.</span>
                        </button>
                        <button
                          type="button"
                          className="workbench-button workbench-button--subtle"
                          onClick={() => handleForkFromEvent(selectedAtlasNode.eventId)}
                        >
                          <strong>Fork from here</strong>
                          <span>Start a child run from this exact replay point.</span>
                        </button>
                        {selectedAtlasNode.eventType === "transform-applied" ? (
                          <button
                            type="button"
                            className={`workbench-button ${
                              observedPathEventIds.includes(selectedAtlasNode.eventId)
                                ? "workbench-button--active"
                                : ""
                            }`}
                            onClick={() => toggleObservedPathEvent(selectedAtlasNode.eventId)}
                          >
                            <strong>
                              {observedPathEventIds.includes(selectedAtlasNode.eventId)
                                ? "Remove from observed path"
                                : "Add to observed path"}
                            </strong>
                            <span>
                              Use Atlas events to sketch a candidate reusable workflow path.
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="workbench-note">Select an atlas event to inspect it here.</p>
                  )}
                </div>
              </div>

              <div className="workbench-panel-divider" />

              <div className="projection-section">
                <div className="recipe-header">
                  <div>
                    <p className={lensShellClasses.eyebrow}>Run Journal</p>
                    <h3 className="workbench-section-title">Session transcript</h3>
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

                <div className="workbench-actions transcript-actions">
                  <button
                    type="button"
                    className="workbench-button"
                    onClick={handleExportRunJournal}
                  >
                    <strong>Export run journal JSON</strong>
                    <span>Save just the current append-only session transcript.</span>
                  </button>
                  <button
                    type="button"
                    className="workbench-button workbench-button--subtle"
                    onClick={() => journalImportRef.current?.click()}
                  >
                    <strong>Load run journal JSON</strong>
                    <span>Import one saved session into the current workspace.</span>
                  </button>
                </div>

                <ol className="transcript-list">
                  {transcriptEntries.map((entry, index) => (
                    <li
                      key={entry.id}
                      ref={(element) => {
                        transcriptEntryRefs.current[entry.id] = element;
                      }}
                      className={`transcript-item ${
                        selectedAtlasNode?.eventId === entry.id ? "transcript-item--selected" : ""
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => focusEvent(entry.id, "transcript")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          focusEvent(entry.id, "transcript");
                        }
                      }}
                    >
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
                          onClick={(event) => {
                            event.stopPropagation();
                            handleMarkCheckpoint(entry.id);
                          }}
                        >
                          <strong>Mark checkpoint</strong>
                          <span>Name this moment so it is easier to fork later.</span>
                        </button>
                        <button
                          type="button"
                          className="workbench-button workbench-button--subtle"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleForkFromEvent(entry.id);
                          }}
                        >
                          <strong>Fork from here</strong>
                          <span>Start a new manual session from this replay point.</span>
                        </button>
                        {atlasProjection.nodes.find(
                          (node) => node.eventId === entry.id && node.eventType === "transform-applied"
                        ) ? (
                          <button
                            type="button"
                            className={`workbench-button ${
                              observedPathEventIds.includes(entry.id)
                                ? "workbench-button--active"
                                : ""
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleObservedPathEvent(entry.id);
                            }}
                          >
                            <strong>
                              {observedPathEventIds.includes(entry.id)
                                ? "Remove from observed path"
                                : "Add to observed path"}
                            </strong>
                            <span>Use this transform event as part of a candidate recipe path.</span>
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </LensPanel>
        </div>

        <div className="workbench-dashboard__column workbench-dashboard__column--bench">
          <LensPanel>
            <div className={lensShellClasses.panelHeader}>
              <div>
                <p className={lensShellClasses.eyebrow}>Artifact flow</p>
                <h2>Current head, transforms, and derived output</h2>
              </div>
              <p className="workbench-note">
                The manual seam stays visible: inspect the current artifact, run one transform,
                inspect the result, then promote or export it on purpose.
              </p>
            </div>

            <div className="workbench-stack">
              <div className="artifact-head-grid">
                <article className="workbench-card artifact-head-card">
                  <div className="recipe-header">
                    <div>
                      <p className={lensShellClasses.eyebrow}>Current artifact</p>
                      <h3 className="workbench-section-title">{currentArtifact.title}</h3>
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
                </article>

                <article className="workbench-card artifact-head-card">
                  <div className="recipe-header">
                    <div>
                      <p className={lensShellClasses.eyebrow}>Derived artifact</p>
                      <h3 className="workbench-section-title">
                        {derivedArtifact ? derivedArtifact.title : "Nothing derived yet"}
                      </h3>
                    </div>
                    {derivedArtifact ? (
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
                    ) : null}
                  </div>

                  {derivedArtifact ? (
                    <>
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
                            This derived <code>{derivedArtifact.kind}</code> artifact matches the
                            next recipe step, but it is not current yet.
                          </span>
                          <span>
                            Use <code>Promote derived artifact to continue recipe</code> before
                            applying the next transform.
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
                        Import or load an artifact, choose a compatible transform, and apply it
                        here.
                      </p>
                    </div>
                  )}
                </article>
              </div>

              <div className="workbench-panel-divider" />

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
                                Load or promote the correct artifact kind manually. The lab will
                                not switch it for you.
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
                        This recipe has reached <code>{activeRecipe.targetKind}</code>. You can
                        still inspect or export the resulting artifact manually.
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
                      updateWorkspace((current) => ({
                        ...current,
                        currentTargetArtifactKind: event.target.value as LensArtifactKind | "",
                      }))
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
                      No registered transform path currently reaches{" "}
                      <code>{targetArtifactKind}</code> from <code>{currentArtifact.kind}</code>.
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
                <div className="workbench-actions">
                  {compatibleTransforms.map((transform) => (
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
                  ))}
                </div>
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
                <p className={lensShellClasses.eyebrow}>Session comparison</p>
                <h2>Head comparison</h2>
              </div>
              <p className="workbench-note">
                Compare two session heads side by side, then read the lens-aware diff summary
                underneath.
              </p>
            </div>

            <div className="workbench-stack">
              {comparisonCandidates.length > 0 ? (
                <>
                  <label className="workbench-field">
                    <span>Compare current session against</span>
                    <select
                      value={effectiveComparisonSessionId}
                      onChange={(event) =>
                        updateWorkspace((current) => ({
                          ...current,
                          comparisonSessionId: event.target.value,
                        }))
                      }
                    >
                      {comparisonCandidates.map((journal) => (
                        <option key={journal.sessionId} value={journal.sessionId}>
                          {journal.sessionId} · {describeSession(journal)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {comparisonJournal && comparisonProjected ? (
                    <>
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

                      {headComparison ? (
                        <div className="comparison-card diff-summary-card">
                          <p className={lensShellClasses.eyebrow}>Diff summary</p>
                          <p className="workbench-note">
                            Showing structured changes from the comparison head to the current
                            head.
                          </p>
                          <div className="diff-summary-stack">
                            {buildDiffSummarySections(headComparison).map((section) => (
                              <section className="diff-summary-section" key={section.title}>
                                <h3 className="workbench-section-title">{section.title}</h3>
                                <ul className="workbench-list diff-summary-list">
                                  {section.lines.map((line) => (
                                    <li key={`${section.title}-${line}`}>{line}</li>
                                  ))}
                                </ul>
                              </section>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
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
        </div>
      </main>
    </LensShell>
  );
}
