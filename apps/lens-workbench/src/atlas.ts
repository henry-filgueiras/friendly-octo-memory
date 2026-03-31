import type { LensArtifactKind, LensRecipe, LensTransform } from "lens-core";
import { getLensRecipe, getLensTransformById } from "lens-core";
import type {
  ArtifactLabCheckpoint,
  ArtifactLabReplayTimelineEntry,
  ArtifactLabRunEvent,
  ArtifactLabRunJournal,
  ArtifactLabTranscriptEntry,
} from "./runJournal";
import {
  formatArtifactLabRunEvent,
  getArtifactLabCheckpoints,
  getArtifactLabReplayTimeline,
} from "./runJournal";
import type { WorkbenchArtifact } from "./sampleArtifacts";

export type WorkflowAtlasLane = "branch" | "workflow" | "artifact";

export interface WorkflowAtlasNode {
  eventId: string;
  eventType: ArtifactLabRunEvent["type"];
  lane: WorkflowAtlasLane;
  index: number;
  title: string;
  detail: string;
  timestamp: string;
  checkpointLabels: string[];
  artifact?: WorkbenchArtifact;
  exportedArtifact?: {
    artifactKind: string;
    artifactTitle: string;
    filename: string;
    source: "current" | "derived";
  };
  stateAfter: ArtifactLabReplayTimelineEntry["stateAfter"];
  recipeStepMatch?: {
    recipeId: string;
    stepIndex: number;
    transformId: string;
  };
  transform?: LensTransform<LensArtifactKind, LensArtifactKind> | null;
}

export interface WorkflowAtlasProjection {
  forkOrigin?: ArtifactLabRunJournal["forkedFrom"];
  checkpoints: ArtifactLabCheckpoint[];
  transcriptEntries: ArtifactLabTranscriptEntry[];
  nodes: WorkflowAtlasNode[];
    activeRecipe: {
      recipe: LensRecipe;
      completedSteps: number;
      completedEventIds: string[];
      remainingTransforms: Array<LensTransform<LensArtifactKind, LensArtifactKind>>;
    } | null;
}

function getAtlasLane(eventType: ArtifactLabRunEvent["type"]): WorkflowAtlasLane {
  switch (eventType) {
    case "checkpoint-marked":
      return "branch";
    case "recipe-activated":
    case "recipe-cleared":
    case "transform-selected":
    case "transform-applied":
      return "workflow";
    case "artifact-loaded":
    case "artifact-imported":
    case "derived-artifact-promoted":
    case "artifact-exported":
      return "artifact";
  }
}

function getAtlasArtifact(event: ArtifactLabRunEvent): WorkbenchArtifact | undefined {
  switch (event.type) {
    case "artifact-loaded":
    case "artifact-imported":
    case "derived-artifact-promoted":
      return event.artifact;
    case "transform-applied":
      return event.outputArtifact;
    default:
      return undefined;
  }
}

export function buildWorkflowAtlasProjection(journal: ArtifactLabRunJournal): WorkflowAtlasProjection {
  const checkpointsByEventId = new Map(
    getArtifactLabCheckpoints(journal).map((entry) => [entry.eventId, entry.labels] as const)
  );
  const transcriptEntries = journal.events.map(formatArtifactLabRunEvent);
  const replayTimeline = getArtifactLabReplayTimeline(journal);
  const completedRecipeEventIds: string[] = [];

  const nodes = replayTimeline.map(({ event, stateBefore, stateAfter }, index) => {
    const transcript = transcriptEntries[index];
    const transform = "transformId" in event ? getLensTransformById(event.transformId) ?? null : null;

    const recipeStepMatch =
      event.type === "transform-applied" &&
      stateBefore.activeRecipeId &&
      stateAfter.completedRecipeSteps > stateBefore.completedRecipeSteps
        ? {
            recipeId: stateBefore.activeRecipeId,
            stepIndex: stateAfter.completedRecipeSteps - 1,
            transformId: event.transformId,
          }
        : undefined;

    if (recipeStepMatch) {
      completedRecipeEventIds.push(event.id);
    }

    return {
      eventId: event.id,
      eventType: event.type,
      lane: getAtlasLane(event.type),
      index,
      title: transcript.title,
      detail: transcript.detail,
      timestamp: transcript.timestamp,
      checkpointLabels: checkpointsByEventId.get(event.id) ?? [],
      artifact: getAtlasArtifact(event),
      exportedArtifact:
        event.type === "artifact-exported"
          ? {
              artifactKind: event.artifactKind,
              artifactTitle: event.artifactTitle,
              filename: event.filename,
              source: event.source,
            }
          : undefined,
      stateAfter,
      recipeStepMatch,
      transform,
    };
  });

  const finalState = replayTimeline.at(-1)?.stateAfter ?? {
    currentArtifact: null,
    derivedArtifact: null,
    activeRecipeId: null,
    completedRecipeSteps: 0,
    selectedTransformId: null,
  };
  const recipe = finalState.activeRecipeId ? getLensRecipe(finalState.activeRecipeId) ?? null : null;

  return {
    forkOrigin: journal.forkedFrom,
    checkpoints: getArtifactLabCheckpoints(journal),
    transcriptEntries,
    nodes,
    activeRecipe: recipe
      ? {
          recipe,
          completedSteps: finalState.completedRecipeSteps,
          completedEventIds: completedRecipeEventIds,
          remainingTransforms: recipe.transformIds
            .slice(finalState.completedRecipeSteps)
            .map((transformId) => getLensTransformById(transformId))
            .filter((transform): transform is LensTransform<LensArtifactKind, LensArtifactKind> =>
              Boolean(transform)
            ),
        }
      : null,
  };
}
