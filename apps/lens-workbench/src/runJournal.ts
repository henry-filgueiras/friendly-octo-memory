import type { LensArtifactKind, LensRecipe, LensTransform } from "lens-core";
import {
  getCompatibleLensTransforms,
  getLensRecipe,
  getLensTransformById,
} from "lens-core";
import type { WorkbenchArtifact } from "./sampleArtifacts";

export interface ArtifactLabRunJournal {
  journalType: "ArtifactLabRunJournal";
  schemaVersion: 1;
  sessionId: string;
  createdAt: string;
  forkedFrom?: {
    sessionId: string;
    eventId: string;
    checkpointLabel?: string | null;
  };
  events: ArtifactLabRunEvent[];
}

interface ArtifactLabRunEventBase {
  id: string;
  at: string;
}

export interface ArtifactLoadedEvent extends ArtifactLabRunEventBase {
  type: "artifact-loaded";
  artifact: WorkbenchArtifact;
  source: "sample" | "manual";
}

export interface ArtifactImportedEvent extends ArtifactLabRunEventBase {
  type: "artifact-imported";
  artifact: WorkbenchArtifact;
  filename?: string;
}

export interface RecipeActivatedEvent extends ArtifactLabRunEventBase {
  type: "recipe-activated";
  recipeId: string;
}

export interface RecipeClearedEvent extends ArtifactLabRunEventBase {
  type: "recipe-cleared";
}

export interface TransformSelectedEvent extends ArtifactLabRunEventBase {
  type: "transform-selected";
  transformId: string;
}

export interface TransformAppliedEvent extends ArtifactLabRunEventBase {
  type: "transform-applied";
  transformId: string;
  outputArtifact: WorkbenchArtifact;
}

export interface DerivedArtifactPromotedEvent extends ArtifactLabRunEventBase {
  type: "derived-artifact-promoted";
  artifact: WorkbenchArtifact;
}

export interface ArtifactExportedEvent extends ArtifactLabRunEventBase {
  type: "artifact-exported";
  artifactId: string;
  artifactKind: LensArtifactKind;
  artifactTitle: string;
  filename: string;
  source: "current" | "derived";
}

export interface CheckpointMarkedEvent extends ArtifactLabRunEventBase {
  type: "checkpoint-marked";
  targetEventId: string;
  label: string;
}

export type ArtifactLabRunEvent =
  | ArtifactLoadedEvent
  | ArtifactImportedEvent
  | RecipeActivatedEvent
  | RecipeClearedEvent
  | TransformSelectedEvent
  | TransformAppliedEvent
  | DerivedArtifactPromotedEvent
  | ArtifactExportedEvent
  | CheckpointMarkedEvent;

export type ArtifactLabRunEventInput =
  | Omit<ArtifactLoadedEvent, "id" | "at">
  | Omit<ArtifactImportedEvent, "id" | "at">
  | Omit<RecipeActivatedEvent, "id" | "at">
  | Omit<RecipeClearedEvent, "id" | "at">
  | Omit<TransformSelectedEvent, "id" | "at">
  | Omit<TransformAppliedEvent, "id" | "at">
  | Omit<DerivedArtifactPromotedEvent, "id" | "at">
  | Omit<ArtifactExportedEvent, "id" | "at">
  | Omit<CheckpointMarkedEvent, "id" | "at">;

export interface ArtifactLabReplayState {
  currentArtifact: WorkbenchArtifact | null;
  derivedArtifact: WorkbenchArtifact | null;
  activeRecipeId: string | null;
  completedRecipeSteps: number;
  selectedTransformId: string | null;
}

export interface ArtifactLabTranscriptEntry {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
}

export interface ArtifactLabCheckpoint {
  eventId: string;
  labels: string[];
}

export interface ArtifactLabReplayTimelineEntry {
  event: ArtifactLabRunEvent;
  stateBefore: ArtifactLabReplayState;
  stateAfter: ArtifactLabReplayState;
}

let sessionCounter = 0;

function createSessionId() {
  sessionCounter += 1;
  return `session-${Date.now()}-${sessionCounter}`;
}

function deriveSelectedTransformId(
  currentArtifact: WorkbenchArtifact | null,
  activeRecipeId: string | null,
  completedRecipeSteps: number
) {
  if (!currentArtifact) {
    return null;
  }

  if (activeRecipeId) {
    const recipe = getLensRecipe(activeRecipeId);
    const expectedTransformId = recipe?.transformIds[completedRecipeSteps];
    const expectedTransform = expectedTransformId
      ? getLensTransformById(expectedTransformId)
      : undefined;

    if (expectedTransform && expectedTransform.inputKind === currentArtifact.kind) {
      return expectedTransform.id;
    }
  }

  return getCompatibleLensTransforms(currentArtifact.kind)[0]?.id ?? null;
}

function maybeAdvanceRecipeStep(
  activeRecipeId: string | null,
  completedRecipeSteps: number,
  event: TransformAppliedEvent
) {
  if (!activeRecipeId) {
    return completedRecipeSteps;
  }

  const recipe = getLensRecipe(activeRecipeId);
  const expectedTransformId = recipe?.transformIds[completedRecipeSteps];
  const expectedTransform = expectedTransformId
    ? getLensTransformById(expectedTransformId)
    : undefined;

  if (
    expectedTransform &&
    event.transformId === expectedTransform.id &&
    event.outputArtifact.kind === expectedTransform.outputKind
  ) {
    return completedRecipeSteps + 1;
  }

  return completedRecipeSteps;
}

function applyArtifactLabRunEventToState(
  currentState: ArtifactLabReplayState,
  event: ArtifactLabRunEvent
): ArtifactLabReplayState {
  switch (event.type) {
    case "artifact-loaded":
    case "artifact-imported":
      return {
        ...currentState,
        currentArtifact: event.artifact,
        derivedArtifact: null,
        selectedTransformId: deriveSelectedTransformId(
          event.artifact,
          currentState.activeRecipeId,
          currentState.completedRecipeSteps
        ),
      };
    case "recipe-activated":
      return {
        ...currentState,
        activeRecipeId: event.recipeId,
        completedRecipeSteps: 0,
        selectedTransformId: deriveSelectedTransformId(
          currentState.currentArtifact,
          event.recipeId,
          0
        ),
      };
    case "recipe-cleared":
      return {
        ...currentState,
        activeRecipeId: null,
        completedRecipeSteps: 0,
        selectedTransformId: deriveSelectedTransformId(currentState.currentArtifact, null, 0),
      };
    case "transform-selected": {
      const transform = getLensTransformById(event.transformId);

      if (
        transform &&
        currentState.currentArtifact &&
        transform.inputKind === currentState.currentArtifact.kind
      ) {
        return {
          ...currentState,
          selectedTransformId: transform.id,
        };
      }

      return currentState;
    }
    case "transform-applied": {
      const nextCompletedSteps = maybeAdvanceRecipeStep(
        currentState.activeRecipeId,
        currentState.completedRecipeSteps,
        event
      );

      return {
        ...currentState,
        derivedArtifact: event.outputArtifact,
        completedRecipeSteps: nextCompletedSteps,
        selectedTransformId:
          nextCompletedSteps !== currentState.completedRecipeSteps
            ? deriveSelectedTransformId(
                currentState.currentArtifact,
                currentState.activeRecipeId,
                nextCompletedSteps
              )
            : currentState.selectedTransformId,
      };
    }
    case "derived-artifact-promoted":
      return {
        ...currentState,
        currentArtifact: event.artifact,
        derivedArtifact: null,
        selectedTransformId: deriveSelectedTransformId(
          event.artifact,
          currentState.activeRecipeId,
          currentState.completedRecipeSteps
        ),
      };
    case "artifact-exported":
    case "checkpoint-marked":
      return currentState;
  }
}

export function createArtifactLabRunJournal(
  initialArtifact: WorkbenchArtifact,
  createdAt = new Date().toISOString()
): ArtifactLabRunJournal {
  return {
    journalType: "ArtifactLabRunJournal",
    schemaVersion: 1,
    sessionId: createSessionId(),
    createdAt,
    events: [
      {
        id: "event-1",
        at: createdAt,
        type: "artifact-loaded",
        artifact: initialArtifact,
        source: "sample",
      },
    ],
  };
}

export function appendArtifactLabRunEvent(
  journal: ArtifactLabRunJournal,
  input: ArtifactLabRunEventInput,
  at = new Date().toISOString()
): ArtifactLabRunJournal {
  return {
    ...journal,
    events: [
      ...journal.events,
      {
        ...input,
        id: `event-${journal.events.length + 1}`,
        at,
      } as ArtifactLabRunEvent,
    ],
  };
}

export function isArtifactLabRunJournal(value: unknown): value is ArtifactLabRunJournal {
  return Boolean(
    value &&
      typeof value === "object" &&
      "journalType" in value &&
      "schemaVersion" in value &&
      "sessionId" in value &&
      "createdAt" in value &&
      "events" in value &&
      Array.isArray((value as { events?: unknown[] }).events) &&
      (value as { journalType?: string }).journalType === "ArtifactLabRunJournal"
  );
}

export function getArtifactLabCheckpointMap(
  journal: ArtifactLabRunJournal
): Record<string, string[]> {
  const checkpoints: Record<string, string[]> = {};

  for (const event of journal.events) {
    if (event.type !== "checkpoint-marked") {
      continue;
    }

    checkpoints[event.targetEventId] ??= [];
    checkpoints[event.targetEventId].push(event.label);
  }

  return checkpoints;
}

export function getArtifactLabCheckpoints(journal: ArtifactLabRunJournal): ArtifactLabCheckpoint[] {
  return Object.entries(getArtifactLabCheckpointMap(journal)).map(([eventId, labels]) => ({
    eventId,
    labels,
  }));
}

export function createForkedArtifactLabRunJournal(
  journal: ArtifactLabRunJournal,
  targetEventId: string,
  createdAt = new Date().toISOString()
): ArtifactLabRunJournal {
  const eventIndex = journal.events.findIndex((event) => event.id === targetEventId);

  if (eventIndex === -1) {
    throw new Error(`Cannot fork from unknown event ${targetEventId}.`);
  }

  const checkpointLabel =
    getArtifactLabCheckpointMap(journal)[targetEventId]?.slice(-1)[0] ?? null;

  return {
    journalType: "ArtifactLabRunJournal",
    schemaVersion: 1,
    sessionId: createSessionId(),
    createdAt,
    forkedFrom: {
      sessionId: journal.sessionId,
      eventId: targetEventId,
      checkpointLabel,
    },
    events: journal.events.slice(0, eventIndex + 1),
  };
}

export function replayArtifactLabRunJournal(
  journal: ArtifactLabRunJournal
): ArtifactLabReplayState {
  let state: ArtifactLabReplayState = {
    currentArtifact: null,
    derivedArtifact: null,
    activeRecipeId: null,
    completedRecipeSteps: 0,
    selectedTransformId: null,
  };

  for (const event of journal.events) {
    state = applyArtifactLabRunEventToState(state, event);
  }

  return state;
}

export function getArtifactLabReplayTimeline(
  journal: ArtifactLabRunJournal
): ArtifactLabReplayTimelineEntry[] {
  let state: ArtifactLabReplayState = {
    currentArtifact: null,
    derivedArtifact: null,
    activeRecipeId: null,
    completedRecipeSteps: 0,
    selectedTransformId: null,
  };

  return journal.events.map((event) => {
    const stateBefore = state;
    const stateAfter = applyArtifactLabRunEventToState(stateBefore, event);
    state = stateAfter;

    return {
      event,
      stateBefore,
      stateAfter,
    };
  });
}

export function formatArtifactLabRunEvent(
  event: ArtifactLabRunEvent
): ArtifactLabTranscriptEntry {
  switch (event.type) {
    case "artifact-loaded":
      return {
        id: event.id,
        timestamp: event.at,
        title: "Artifact loaded",
        detail: `${event.artifact.kind}: ${event.artifact.title} (${event.source})`,
      };
    case "artifact-imported":
      return {
        id: event.id,
        timestamp: event.at,
        title: "Artifact imported",
        detail: `${event.artifact.kind}: ${event.artifact.title}${
          event.filename ? ` from ${event.filename}` : ""
        }`,
      };
    case "recipe-activated": {
      const recipe = getLensRecipe(event.recipeId);

      return {
        id: event.id,
        timestamp: event.at,
        title: "Recipe activated",
        detail: recipe ? `${recipe.label} (${recipe.startKind} -> ${recipe.targetKind})` : event.recipeId,
      };
    }
    case "recipe-cleared":
      return {
        id: event.id,
        timestamp: event.at,
        title: "Recipe cleared",
        detail: "Returned to freeform transform selection.",
      };
    case "transform-selected": {
      const transform = getLensTransformById(event.transformId);

      return {
        id: event.id,
        timestamp: event.at,
        title: "Transform selected",
        detail: transform
          ? `${transform.name} (${transform.inputKind} -> ${transform.outputKind})`
          : event.transformId,
      };
    }
    case "transform-applied": {
      const transform = getLensTransformById(event.transformId);

      return {
        id: event.id,
        timestamp: event.at,
        title: "Transform applied",
        detail: `${transform?.name ?? event.transformId} produced ${event.outputArtifact.kind}: ${event.outputArtifact.title}`,
      };
    }
    case "derived-artifact-promoted":
      return {
        id: event.id,
        timestamp: event.at,
        title: "Derived artifact promoted",
        detail: `${event.artifact.kind}: ${event.artifact.title} is now the current source artifact.`,
      };
    case "artifact-exported":
      return {
        id: event.id,
        timestamp: event.at,
        title: "Artifact exported",
        detail: `${event.artifactKind}: ${event.artifactTitle} exported as ${event.filename} (${event.source})`,
      };
    case "checkpoint-marked":
      return {
        id: event.id,
        timestamp: event.at,
        title: "Checkpoint marked",
        detail: `${event.label} on ${event.targetEventId}`,
      };
  }
}

export function getRecipeTransforms(recipe: LensRecipe | null) {
  return recipe
    ? recipe.transformIds
        .map((transformId) => getLensTransformById(transformId))
        .filter((transform): transform is LensTransform<LensArtifactKind, LensArtifactKind> =>
          Boolean(transform)
        )
    : [];
}
