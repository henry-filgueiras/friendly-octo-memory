import { describe, expect, it } from "vitest";
import { buildWorkspaceConstellation, type ConstellationSessionSnapshot } from "../src/constellation";

const SNAPSHOTS: ConstellationSessionSnapshot[] = [
  {
    sessionId: "session-root",
    createdAt: "2026-03-30T10:00:00.000Z",
    eventCount: 4,
    currentArtifactKind: "ExecutionPlan",
    currentArtifactTitle: "Launch execution plan",
    activeRecipeId: null,
    completedRecipeSteps: 0,
  },
  {
    sessionId: "session-child-a",
    createdAt: "2026-03-30T10:05:00.000Z",
    eventCount: 6,
    forkedFromSessionId: "session-root",
    currentArtifactKind: "ClaimSet",
    currentArtifactTitle: "Launch pressure claims",
    activeRecipeId: "threadline-plan-pressure-to-evidence-map",
    completedRecipeSteps: 1,
  },
  {
    sessionId: "session-child-b",
    createdAt: "2026-03-30T10:07:00.000Z",
    eventCount: 7,
    forkedFromSessionId: "session-child-a",
    currentArtifactKind: "EvidenceMap",
    currentArtifactTitle: "Launch evidence map",
    activeRecipeId: "threadline-plan-pressure-to-evidence-map",
    completedRecipeSteps: 2,
  },
];

describe("workspace constellation", () => {
  it("lays out sessions deterministically from the same workspace snapshots", () => {
    const first = buildWorkspaceConstellation(
      SNAPSHOTS,
      "session-child-b",
      "session-root",
      "workspace-seed"
    );
    const second = buildWorkspaceConstellation(
      SNAPSHOTS,
      "session-child-b",
      "session-root",
      "workspace-seed"
    );

    expect(second).toEqual(first);
  });

  it("preserves ancestry depth and current/comparison highlighting", () => {
    const layout = buildWorkspaceConstellation(
      SNAPSHOTS,
      "session-child-b",
      "session-root",
      "workspace-seed"
    );

    const root = layout.nodes.find((node) => node.sessionId === "session-root");
    const childA = layout.nodes.find((node) => node.sessionId === "session-child-a");
    const childB = layout.nodes.find((node) => node.sessionId === "session-child-b");

    expect(root?.depth).toBe(0);
    expect(childA?.depth).toBe(1);
    expect(childB?.depth).toBe(2);
    expect(root?.isComparison).toBe(true);
    expect(childB?.isCurrent).toBe(true);
    expect(layout.links).toHaveLength(2);
    expect(layout.kindsPresent).toEqual(["ExecutionPlan", "ClaimSet", "EvidenceMap"]);
  });
});
