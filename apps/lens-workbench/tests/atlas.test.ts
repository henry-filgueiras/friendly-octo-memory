import { describe, expect, it } from "vitest";
import { buildWorkflowAtlasProjection } from "../src/atlas";
import {
  appendArtifactLabRunEvent,
  createArtifactLabRunJournal,
  createForkedArtifactLabRunJournal,
} from "../src/runJournal";
import { SAMPLE_CLAIM_SET_ARTIFACT, SAMPLE_EXECUTION_PLAN_ARTIFACT } from "../src/sampleArtifacts";

describe("workflow atlas projection", () => {
  it("projects journal events into atlas nodes with lanes and recipe progress", () => {
    const journal0 = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T10:00:00.000Z"
    );
    const journal1 = appendArtifactLabRunEvent(
      journal0,
      {
        type: "recipe-activated",
        recipeId: "threadline-plan-pressure-to-evidence-map",
      },
      "2026-03-30T10:01:00.000Z"
    );
    const journal2 = appendArtifactLabRunEvent(
      journal1,
      {
        type: "transform-applied",
        transformId: "execution-plan-to-claim-set",
        outputArtifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T10:02:00.000Z"
    );
    const journal3 = appendArtifactLabRunEvent(
      journal2,
      {
        type: "checkpoint-marked",
        targetEventId: "event-3",
        label: "Claim handoff",
      },
      "2026-03-30T10:03:00.000Z"
    );
    const journal4 = appendArtifactLabRunEvent(
      journal3,
      {
        type: "derived-artifact-promoted",
        artifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T10:04:00.000Z"
    );

    const atlas = buildWorkflowAtlasProjection(journal4);

    expect(atlas.nodes).toHaveLength(5);
    expect(atlas.nodes.map((node) => node.lane)).toEqual([
      "artifact",
      "workflow",
      "workflow",
      "branch",
      "artifact",
    ]);
    expect(atlas.nodes[2]?.recipeStepMatch).toEqual({
      recipeId: "threadline-plan-pressure-to-evidence-map",
      stepIndex: 0,
      transformId: "execution-plan-to-claim-set",
    });
    expect(atlas.nodes[2]?.artifact?.kind).toBe("ClaimSet");
    expect(atlas.nodes[2]?.stateAfter.derivedArtifact?.kind).toBe("ClaimSet");
    expect(atlas.nodes[2]?.checkpointLabels).toEqual(["Claim handoff"]);
    expect(atlas.activeRecipe?.completedSteps).toBe(1);
    expect(atlas.activeRecipe?.completedEventIds).toEqual(["event-3"]);
    expect(atlas.activeRecipe?.remainingTransforms.map((transform) => transform.id)).toEqual([
      "claim-set-to-evidence-map-seed",
    ]);
  });

  it("preserves fork-origin metadata in the atlas projection", () => {
    const base = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T10:00:00.000Z"
    );
    const withCheckpoint = appendArtifactLabRunEvent(
      base,
      {
        type: "checkpoint-marked",
        targetEventId: "event-1",
        label: "Root checkpoint",
      },
      "2026-03-30T10:01:00.000Z"
    );
    const fork = createForkedArtifactLabRunJournal(
      withCheckpoint,
      "event-1",
      "2026-03-30T10:02:00.000Z"
    );

    const atlas = buildWorkflowAtlasProjection(fork);

    expect(atlas.forkOrigin).toEqual({
      sessionId: withCheckpoint.sessionId,
      eventId: "event-1",
      checkpointLabel: "Root checkpoint",
    });
    expect(atlas.nodes[0]?.eventId).toBe("event-1");
  });
});
