import { describe, expect, it } from "vitest";
import {
  appendArtifactLabRunEvent,
  createArtifactLabRunJournal,
  createForkedArtifactLabRunJournal,
  replayArtifactLabRunJournal,
} from "../src/runJournal";
import { SAMPLE_CLAIM_SET_ARTIFACT, SAMPLE_EXECUTION_PLAN_ARTIFACT } from "../src/sampleArtifacts";
import {
  createArtifactLabWorkspace,
  loadArtifactLabWorkspaceFromStorage,
  parseArtifactLabWorkspace,
  saveArtifactLabWorkspaceToStorage,
  syncArtifactLabWorkspace,
} from "../src/workspace";

describe("Artifact Lab workspace", () => {
  it("serializes and deserializes a workspace bundle", () => {
    const base = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T12:00:00.000Z"
    );
    const fork = createForkedArtifactLabRunJournal(base, "event-1", "2026-03-30T12:01:00.000Z");
    const workspace = syncArtifactLabWorkspace({
      ...createArtifactLabWorkspace(base, "2026-03-30T12:00:00.000Z"),
      knownRunJournals: [base, fork],
      currentSessionId: fork.sessionId,
      comparisonSessionId: base.sessionId,
      currentTargetArtifactKind: "EvidenceMap",
      updatedAt: "2026-03-30T12:02:00.000Z",
    });

    const restored = parseArtifactLabWorkspace(JSON.parse(JSON.stringify(workspace)));

    expect(restored?.workspaceId).toBe(workspace.workspaceId);
    expect(restored?.knownRunJournals).toHaveLength(2);
    expect(restored?.currentSessionId).toBe(fork.sessionId);
    expect(restored?.comparisonSessionId).toBe(base.sessionId);
    expect(restored?.currentTargetArtifactKind).toBe("EvidenceMap");
  });

  it("restores replay state for current and comparison sessions after workspace load", () => {
    const base0 = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T12:00:00.000Z"
    );
    const base1 = appendArtifactLabRunEvent(
      base0,
      {
        type: "recipe-activated",
        recipeId: "threadline-plan-pressure-to-evidence-map",
      },
      "2026-03-30T12:01:00.000Z"
    );
    const base2 = appendArtifactLabRunEvent(
      base1,
      {
        type: "transform-applied",
        transformId: "execution-plan-to-claim-set",
        outputArtifact: SAMPLE_CLAIM_SET_ARTIFACT,
      },
      "2026-03-30T12:02:00.000Z"
    );
    const fork = createForkedArtifactLabRunJournal(base1, "event-2", "2026-03-30T12:03:00.000Z");
    const workspace = syncArtifactLabWorkspace({
      ...createArtifactLabWorkspace(base0, "2026-03-30T12:00:00.000Z"),
      knownRunJournals: [base2, fork],
      currentSessionId: base2.sessionId,
      comparisonSessionId: fork.sessionId,
      currentTargetArtifactKind: "EvidenceMap",
      updatedAt: "2026-03-30T12:04:00.000Z",
    });

    const restored = parseArtifactLabWorkspace(JSON.parse(JSON.stringify(workspace)));

    expect(restored).not.toBeNull();

    const currentJournal = restored!.knownRunJournals.find(
      (journal) => journal.sessionId === restored!.currentSessionId
    )!;
    const comparisonJournal = restored!.knownRunJournals.find(
      (journal) => journal.sessionId === restored!.comparisonSessionId
    )!;
    const currentReplay = replayArtifactLabRunJournal(currentJournal);
    const comparisonReplay = replayArtifactLabRunJournal(comparisonJournal);

    expect(currentReplay.derivedArtifact?.kind).toBe("ClaimSet");
    expect(currentReplay.completedRecipeSteps).toBe(1);
    expect(comparisonReplay.currentArtifact?.kind).toBe("ExecutionPlan");
    expect(restored!.comparisonSessionId).toBe(fork.sessionId);
  });

  it("saves and loads the full workspace from local storage", () => {
    const storage = new Map<string, string>();
    Object.assign(globalThis, {
      window: {
        localStorage: {
          getItem(key: string) {
            return storage.get(key) ?? null;
          },
          setItem(key: string, value: string) {
            storage.set(key, value);
          },
        },
      },
    });

    const base = createArtifactLabRunJournal(
      SAMPLE_EXECUTION_PLAN_ARTIFACT,
      "2026-03-30T12:00:00.000Z"
    );
    const workspace = createArtifactLabWorkspace(base, "2026-03-30T12:00:00.000Z");

    saveArtifactLabWorkspaceToStorage(workspace, "lens-workbench.test");
    const restored = loadArtifactLabWorkspaceFromStorage("lens-workbench.test");

    expect(restored?.workspaceId).toBe(workspace.workspaceId);
    expect(restored?.currentSessionId).toBe(base.sessionId);
  });

  it("rejects invalid workspace shapes safely", () => {
    expect(parseArtifactLabWorkspace({ workspaceType: "ArtifactLabWorkspace" })).toBeNull();

    const storage = new Map<string, string>([
      ["lens-workbench.invalid", JSON.stringify({ workspaceType: "ArtifactLabWorkspace" })],
    ]);
    Object.assign(globalThis, {
      window: {
        localStorage: {
          getItem(key: string) {
            return storage.get(key) ?? null;
          },
          setItem() {},
        },
      },
    });

    expect(loadArtifactLabWorkspaceFromStorage("lens-workbench.invalid")).toBeNull();
  });
});
