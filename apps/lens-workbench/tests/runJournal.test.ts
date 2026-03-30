import { describe, expect, it } from "vitest";
import {
  appendArtifactLabRunEvent,
  createArtifactLabRunJournal,
  createForkedArtifactLabRunJournal,
  getArtifactLabCheckpointMap,
  replayArtifactLabRunJournal,
} from "../src/runJournal";
import { SAMPLE_CLAIM_SET_ARTIFACT, SAMPLE_EXECUTION_PLAN_ARTIFACT } from "../src/sampleArtifacts";

describe("Artifact Lab run journal replay", () => {
  it("replays a recipe-guided session into the expected current state", () => {
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
        type: "derived-artifact-promoted",
        artifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T10:03:00.000Z"
    );

    const replayed = replayArtifactLabRunJournal(journal3);

    expect(replayed.currentArtifact?.kind).toBe("ClaimSet");
    expect(replayed.currentArtifact?.id).toBe(SAMPLE_CLAIM_SET_ARTIFACT.id);
    expect(replayed.derivedArtifact).toBeNull();
    expect(replayed.activeRecipeId).toBe("threadline-plan-pressure-to-evidence-map");
    expect(replayed.completedRecipeSteps).toBe(1);
    expect(replayed.selectedTransformId).toBe("claim-set-to-evidence-map-seed");
  });

  it("reconstructs recipe progress and keeps the derived artifact pending when not yet promoted", () => {
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

    const replayed = replayArtifactLabRunJournal(journal2);

    expect(replayed.currentArtifact?.kind).toBe("ExecutionPlan");
    expect(replayed.derivedArtifact?.kind).toBe("ClaimSet");
    expect(replayed.completedRecipeSteps).toBe(1);
    expect(replayed.selectedTransformId).toBe("execution-plan-to-claim-set");
  });

  it("promoting a derived artifact changes the current artifact deterministically", () => {
    const loadedClaimSet = {
      ...SAMPLE_CLAIM_SET_ARTIFACT,
      id: "artifact-claims-promoted",
      title: "Promoted claim set",
    } as const;

    const journal = {
      journalType: "ArtifactLabRunJournal" as const,
      schemaVersion: 1 as const,
      sessionId: "session-promote",
      createdAt: "2026-03-30T10:00:00.000Z",
      events: [
        {
          id: "event-1",
          at: "2026-03-30T10:00:00.000Z",
          type: "artifact-loaded" as const,
          artifact: SAMPLE_EXECUTION_PLAN_ARTIFACT,
          source: "sample" as const,
        },
        {
          id: "event-2",
          at: "2026-03-30T10:01:00.000Z",
          type: "transform-applied" as const,
          transformId: "execution-plan-to-claim-set",
          outputArtifact: loadedClaimSet,
        },
        {
          id: "event-3",
          at: "2026-03-30T10:02:00.000Z",
          type: "derived-artifact-promoted" as const,
          artifact: loadedClaimSet,
        },
      ],
    };

    const replayed = replayArtifactLabRunJournal(journal);

    expect(replayed.currentArtifact?.id).toBe("artifact-claims-promoted");
    expect(replayed.currentArtifact?.kind).toBe("ClaimSet");
    expect(replayed.derivedArtifact).toBeNull();
  });
});

describe("Artifact Lab checkpoints and forks", () => {
  it("preserves checkpoint and fork metadata when creating a child run", () => {
    const base = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T11:00:00.000Z"
    );
    const withCheckpoint = appendArtifactLabRunEvent(
      base,
      {
        type: "checkpoint-marked",
        targetEventId: "event-1",
        label: "Clean execution plan",
      },
      "2026-03-30T11:01:00.000Z"
    );

    const fork = createForkedArtifactLabRunJournal(
      withCheckpoint,
      "event-1",
      "2026-03-30T11:02:00.000Z"
    );

    expect(getArtifactLabCheckpointMap(withCheckpoint)).toEqual({
      "event-1": ["Clean execution plan"],
    });
    expect(fork.forkedFrom).toEqual({
      sessionId: withCheckpoint.sessionId,
      eventId: "event-1",
      checkpointLabel: "Clean execution plan",
    });
    expect(fork.events).toHaveLength(1);
    expect(fork.events[0]?.id).toBe("event-1");
    expect(fork.sessionId).not.toBe(withCheckpoint.sessionId);
  });

  it("replaying a forked journal yields the expected replay state", () => {
    const base0 = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T11:00:00.000Z"
    );
    const base1 = appendArtifactLabRunEvent(
      base0,
      {
        type: "recipe-activated",
        recipeId: "threadline-plan-pressure-to-evidence-map",
      },
      "2026-03-30T11:01:00.000Z"
    );
    const base2 = appendArtifactLabRunEvent(
      base1,
      {
        type: "transform-applied",
        transformId: "execution-plan-to-claim-set",
        outputArtifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T11:02:00.000Z"
    );

    const fork = createForkedArtifactLabRunJournal(base2, "event-2", "2026-03-30T11:03:00.000Z");
    const replayed = replayArtifactLabRunJournal(fork);

    expect(replayed.currentArtifact?.kind).toBe("ExecutionPlan");
    expect(replayed.activeRecipeId).toBe("threadline-plan-pressure-to-evidence-map");
    expect(replayed.completedRecipeSteps).toBe(0);
    expect(replayed.selectedTransformId).toBe("execution-plan-to-claim-set");
  });

  it("parent and child sessions diverge cleanly after additional events", () => {
    const base0 = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T11:00:00.000Z"
    );
    const base1 = appendArtifactLabRunEvent(
      base0,
      {
        type: "recipe-activated",
        recipeId: "threadline-plan-pressure-to-evidence-map",
      },
      "2026-03-30T11:01:00.000Z"
    );

    const child0 = createForkedArtifactLabRunJournal(base1, "event-2", "2026-03-30T11:02:00.000Z");
    const parentAdvanced = appendArtifactLabRunEvent(
      base1,
      {
        type: "transform-applied",
        transformId: "execution-plan-to-claim-set",
        outputArtifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T11:03:00.000Z"
    );
    const childAdvanced = appendArtifactLabRunEvent(
      child0,
      {
        type: "recipe-cleared",
      },
      "2026-03-30T11:04:00.000Z"
    );

    const replayedParent = replayArtifactLabRunJournal(parentAdvanced);
    const replayedChild = replayArtifactLabRunJournal(childAdvanced);

    expect(replayedParent.completedRecipeSteps).toBe(1);
    expect(replayedParent.derivedArtifact?.kind).toBe("ClaimSet");
    expect(replayedChild.completedRecipeSteps).toBe(0);
    expect(replayedChild.activeRecipeId).toBeNull();
    expect(parentAdvanced.events).toHaveLength(3);
    expect(childAdvanced.events).toHaveLength(3);
  });

  it("transform and replay semantics still work after forking", () => {
    const base0 = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T11:00:00.000Z"
    );
    const base1 = appendArtifactLabRunEvent(
      base0,
      {
        type: "recipe-activated",
        recipeId: "threadline-plan-pressure-to-evidence-map",
      },
      "2026-03-30T11:01:00.000Z"
    );
    const fork0 = createForkedArtifactLabRunJournal(base1, "event-2", "2026-03-30T11:02:00.000Z");
    const fork1 = appendArtifactLabRunEvent(
      fork0,
      {
        type: "transform-applied",
        transformId: "execution-plan-to-claim-set",
        outputArtifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T11:03:00.000Z"
    );
    const fork2 = appendArtifactLabRunEvent(
      fork1,
      {
        type: "derived-artifact-promoted",
        artifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T11:04:00.000Z"
    );

    const replayed = replayArtifactLabRunJournal(fork2);

    expect(replayed.currentArtifact?.kind).toBe("ClaimSet");
    expect(replayed.completedRecipeSteps).toBe(1);
    expect(replayed.selectedTransformId).toBe("claim-set-to-evidence-map-seed");
    expect(fork2.forkedFrom?.eventId).toBe("event-2");
  });
});
