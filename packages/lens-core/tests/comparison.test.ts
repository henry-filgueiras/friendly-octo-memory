import { describe, expect, it } from "vitest";
import type { LensArtifactEnvelope, LensArtifactKind, LensArtifactPayloadByKind } from "../src";
import { compareLensArtifactHeads } from "../src";

function createArtifact<TKind extends LensArtifactKind>(
  kind: TKind,
  payload: LensArtifactPayloadByKind[TKind],
  overrides: Partial<LensArtifactEnvelope<TKind>> = {}
): LensArtifactEnvelope<TKind> {
  return {
    id: overrides.id ?? `artifact-${kind.toLowerCase()}`,
    kind,
    schemaVersion: 1,
    title: overrides.title ?? `${kind} artifact`,
    createdAt: overrides.createdAt ?? "2026-03-30T00:00:00.000Z",
    payload,
    provenance: overrides.provenance ?? {
      producedBy: { app: "test-suite" },
      sourceArtifacts: [],
      sourceScenario: { app: "test-suite", scenarioId: "scenario-1", scenarioName: "Scenario 1" },
    },
  };
}

describe("artifact head comparison", () => {
  it("returns a kind mismatch result for different artifact kinds", () => {
    const before = createArtifact("ExecutionPlan", {
      subject: "Launch",
      deadlineDay: 20,
      projectFinishDay: 19,
      deadlineMissDays: 0,
      tasks: [],
    });
    const after = createArtifact("ClaimSet", {
      subject: "Launch",
      claims: [],
    });

    const comparison = compareLensArtifactHeads(before, after);

    expect(comparison.type).toBe("kind-mismatch");
    if (comparison.type !== "kind-mismatch") {
      throw new Error("Expected kind mismatch diff");
    }
    expect(comparison.beforeKind).toBe("ExecutionPlan");
    expect(comparison.afterKind).toBe("ClaimSet");
  });

  it("compares execution-plan heads with task additions, removals, criticality, and constraint changes", () => {
    const before = createArtifact("ExecutionPlan", {
      subject: "Launch",
      deadlineDay: 20,
      projectFinishDay: 19,
      deadlineMissDays: 0,
      tasks: [
        {
          id: "billing",
          name: "Build billing guardrails",
          status: "todo",
          notes: "",
          critical: false,
          constraintIssues: [],
        },
        {
          id: "qa",
          name: "Run beta dry run",
          status: "active",
          notes: "",
          critical: true,
          constraintIssues: ["Needs signoff", "Must finish by day 18"],
        },
        {
          id: "copy",
          name: "Write launch copy",
          status: "todo",
          notes: "",
          critical: false,
          constraintIssues: [],
        },
      ],
    });
    const after = createArtifact("ExecutionPlan", {
      subject: "Launch",
      deadlineDay: 20,
      projectFinishDay: 20,
      deadlineMissDays: 0,
      tasks: [
        {
          id: "billing",
          name: "Build billing guardrails",
          status: "active",
          notes: "",
          critical: true,
          constraintIssues: [],
        },
        {
          id: "qa",
          name: "Run beta dry run",
          status: "active",
          notes: "",
          critical: true,
          constraintIssues: ["Must finish by day 18", "Needs staffing confirmation"],
        },
        {
          id: "support",
          name: "Prepare support macros",
          status: "todo",
          notes: "",
          critical: false,
          constraintIssues: ["Needs help-center signoff"],
        },
      ],
    });

    const comparison = compareLensArtifactHeads(before, after);

    expect(comparison.type).toBe("ExecutionPlan");
    if (comparison.type !== "ExecutionPlan") {
      throw new Error("Expected ExecutionPlan diff");
    }

    expect(comparison.tasksAdded).toEqual([
      {
        id: "support",
        name: "Prepare support macros",
        status: "todo",
        critical: false,
        constraintIssueCount: 1,
      },
    ]);
    expect(comparison.tasksRemoved).toEqual([
      {
        id: "copy",
        name: "Write launch copy",
        status: "todo",
        critical: false,
        constraintIssueCount: 0,
      },
    ]);
    expect(comparison.criticalityChanges).toEqual([
      {
        taskId: "billing",
        taskName: "Build billing guardrails",
        beforeCritical: false,
        afterCritical: true,
      },
    ]);
    expect(comparison.constraintIssueChanges).toEqual([
      {
        taskId: "qa",
        taskName: "Run beta dry run",
        added: ["Needs staffing confirmation"],
        removed: ["Needs signoff"],
      },
    ]);
  });

  it("compares claim-set heads with claim additions, removals, and category changes", () => {
    const before = createArtifact("ClaimSet", {
      subject: "Launch",
      claims: [
        { id: "claim-a", statement: "Billing risk is manageable", category: "Operations" },
        { id: "claim-b", statement: "QA is still on the critical path", category: "Critical path" },
      ],
    });
    const after = createArtifact("ClaimSet", {
      subject: "Launch",
      claims: [
        {
          id: "claim-a",
          statement: "Billing risk is manageable",
          category: "Deadline pressure",
        },
        {
          id: "claim-c",
          statement: "Support readiness still needs evidence",
          category: "Open question",
        },
      ],
    });

    const comparison = compareLensArtifactHeads(before, after);

    expect(comparison.type).toBe("ClaimSet");
    if (comparison.type !== "ClaimSet") {
      throw new Error("Expected ClaimSet diff");
    }

    expect(comparison.claimsAdded).toEqual([
      {
        id: "claim-c",
        statement: "Support readiness still needs evidence",
        category: "Open question",
      },
    ]);
    expect(comparison.claimsRemoved).toEqual([
      {
        id: "claim-b",
        statement: "QA is still on the critical path",
        category: "Critical path",
      },
    ]);
    expect(comparison.categoryChanges).toEqual([
      {
        claimId: "claim-a",
        statement: "Billing risk is manageable",
        beforeCategory: "Operations",
        afterCategory: "Deadline pressure",
      },
    ]);
  });

  it("compares evidence-map heads with additions, removals, and coverage changes", () => {
    const before = createArtifact("EvidenceMap", {
      subject: "Launch",
      claims: [
        { id: "claim-a", statement: "Billing risk is manageable", category: "Operations" },
        { id: "claim-b", statement: "QA is still on the critical path", category: "Critical path" },
      ],
      sources: [{ id: "source-a", title: "Beta launch review" }],
      links: [
        {
          id: "link-a",
          claimId: "claim-a",
          sourceId: "source-a",
          stance: "supports",
        },
      ],
    });
    const after = createArtifact("EvidenceMap", {
      subject: "Launch",
      claims: [
        { id: "claim-a", statement: "Billing risk is manageable", category: "Operations" },
        { id: "claim-c", statement: "Support readiness still needs evidence", category: "Open question" },
      ],
      sources: [
        { id: "source-a", title: "Beta launch review" },
        { id: "source-b", title: "Support staffing notes" },
      ],
      links: [
        {
          id: "link-a",
          claimId: "claim-a",
          sourceId: "source-a",
          stance: "supports",
        },
        {
          id: "link-b",
          claimId: "claim-c",
          sourceId: "source-b",
          stance: "mentions",
        },
      ],
    });

    const comparison = compareLensArtifactHeads(before, after);

    expect(comparison.type).toBe("EvidenceMap");
    if (comparison.type !== "EvidenceMap") {
      throw new Error("Expected EvidenceMap diff");
    }

    expect(comparison.claimsAdded).toEqual([
      {
        id: "claim-c",
        statement: "Support readiness still needs evidence",
        category: "Open question",
      },
    ]);
    expect(comparison.claimsRemoved).toEqual([
      {
        id: "claim-b",
        statement: "QA is still on the critical path",
        category: "Critical path",
      },
    ]);
    expect(comparison.sourcesAdded).toEqual([{ id: "source-b", title: "Support staffing notes" }]);
    expect(comparison.sourcesRemoved).toEqual([]);
    expect(comparison.linksAdded).toEqual([
      {
        id: "link-b",
        claimId: "claim-c",
        sourceId: "source-b",
        stance: "mentions",
      },
    ]);
    expect(comparison.linksRemoved).toEqual([]);
    expect(comparison.coverage).toEqual({
      claims: { before: 2, after: 2 },
      sources: { before: 1, after: 2 },
      links: { before: 1, after: 2 },
      linkedClaims: { before: 1, after: 2 },
      uncoveredClaims: { before: 1, after: 0 },
    });
  });

  it("compares ranked-options heads with rank changes and exclusion changes", () => {
    const before = createArtifact("RankedOptions", {
      subject: "Tool choice",
      ranked: [
        { optionId: "alpha", optionName: "Alpha", rank: 1, score: 92 },
        { optionId: "beta", optionName: "Beta", rank: 2, score: 88 },
        { optionId: "gamma", optionName: "Gamma", rank: 3, score: 84 },
      ],
      excluded: [{ optionId: "delta", optionName: "Delta", reasons: ["Too expensive"] }],
    });
    const after = createArtifact("RankedOptions", {
      subject: "Tool choice",
      ranked: [
        { optionId: "beta", optionName: "Beta", rank: 1, score: 91 },
        { optionId: "alpha", optionName: "Alpha", rank: 2, score: 90 },
        { optionId: "gamma", optionName: "Gamma", rank: 3, score: 84 },
      ],
      excluded: [{ optionId: "epsilon", optionName: "Epsilon", reasons: ["Missing SSO"] }],
    });

    const comparison = compareLensArtifactHeads(before, after);

    expect(comparison.type).toBe("RankedOptions");
    if (comparison.type !== "RankedOptions") {
      throw new Error("Expected RankedOptions diff");
    }

    expect(comparison.rankChanges).toEqual([
      {
        optionId: "beta",
        optionName: "Beta",
        beforeRank: 2,
        afterRank: 1,
      },
      {
        optionId: "alpha",
        optionName: "Alpha",
        beforeRank: 1,
        afterRank: 2,
      },
    ]);
    expect(comparison.exclusionsGained).toEqual([
      {
        optionId: "epsilon",
        optionName: "Epsilon",
        reasons: ["Missing SSO"],
      },
    ]);
    expect(comparison.exclusionsLost).toEqual([
      {
        optionId: "delta",
        optionName: "Delta",
        reasons: ["Too expensive"],
      },
    ]);
  });
});
