import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import {
  LensHero,
  LensPanel,
  LensShell,
  LensStatGrid,
  claimSetToEvidenceMapSeedTransform,
  decisionModelToRankedOptionsTransform,
  executionPlanToClaimSetTransform,
  exportScenarioJson,
  getLensArtifactDefinition,
  getLensRecipe,
  getLensTransformById,
  loadLocalScenario,
  saveLocalScenario,
  unwrapScenarioEnvelope,
} from "../src";

describe("lens-core", () => {
  it("unwraps plain and enveloped scenarios", () => {
    expect(unwrapScenarioEnvelope({ id: "plain" })).toEqual({ id: "plain" });
    expect(unwrapScenarioEnvelope({ scenario: { id: "wrapped" } })).toEqual({ id: "wrapped" });
  });

  it("loads and saves local scenarios through the shared helper", () => {
    const storage = new Map<string, string>();
    const windowStub = {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    };

    Object.assign(globalThis, { window: windowStub });

    saveLocalScenario("lens-core.test", { id: "saved" });

    const loaded = loadLocalScenario({
      createEmpty: () => ({ id: "empty" }),
      storageKey: "lens-core.test",
      sync: (scenario: { id: string }) => ({ ...scenario, synced: true }),
    });

    expect(loaded).toEqual({ id: "saved", synced: true });
  });

  it("falls back to the empty scenario when local storage is empty", () => {
    const windowStub = {
      localStorage: {
        getItem() {
          return null;
        },
      },
    };

    Object.assign(globalThis, { window: windowStub });

    const loaded = loadLocalScenario({
      createEmpty: () => ({ id: "empty" }),
      storageKey: "lens-core.empty",
      sync: (scenario: { id: string }) => ({ ...scenario, synced: true }),
    });

    expect(loaded).toEqual({ id: "empty" });
  });

  it("falls back to the empty scenario when local storage is invalid", () => {
    const windowStub = {
      localStorage: {
        getItem() {
          return "{not-valid-json";
        },
      },
    };

    Object.assign(globalThis, { window: windowStub });

    const loaded = loadLocalScenario({
      createEmpty: () => ({ id: "empty" }),
      storageKey: "lens-core.missing",
      sync: (scenario: { id: string }) => ({ ...scenario, synced: true }),
    });

    expect(loaded).toEqual({ id: "empty" });
  });

  it("exports boring shell wrappers that render predictable markup", () => {
    const html = renderToStaticMarkup(
      <LensShell>
        <LensHero>hero</LensHero>
        <LensPanel>panel</LensPanel>
        <LensStatGrid>stats</LensStatGrid>
      </LensShell>
    );

    expect(typeof LensShell).toBe("function");
    expect(html).toContain("lens-shell");
    expect(html).toContain("lens-hero");
    expect(html).toContain("lens-panel");
    expect(html).toContain("lens-stat-grid");
  });

  it("serializes scenarios for JSON export", () => {
    const downloads: Array<{ filename: string; href: string; downloaded: string | null }> = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalDocument = globalThis.document;

    Object.assign(globalThis, {
      document: {
        createElement() {
          return {
            href: "",
            download: "",
            click() {
              downloads.push({
                filename: this.download,
                href: this.href,
                downloaded: this.download,
              });
            },
          };
        },
      },
    });
    URL.createObjectURL = () => "blob:mock";
    URL.revokeObjectURL = () => {};

    exportScenarioJson("scenario.json", { id: "scenario" });

    expect(downloads[0]?.filename).toBe("scenario.json");
    expect(downloads[0]?.href).toBe("blob:mock");

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    Object.assign(globalThis, { document: originalDocument });
  });

  it("exposes artifact definitions through the tiny registry", () => {
    expect(getLensArtifactDefinition("DecisionModel")?.label).toBe("Decision Model");
    expect(getLensArtifactDefinition("EvidenceMap")?.description).toContain("evidence");
  });

  it("projects ranked options from a scored decision model artifact", () => {
    const ranked = decisionModelToRankedOptionsTransform.run(
      {
        id: "artifact-decision",
        kind: "DecisionModel",
        schemaVersion: 1,
        title: "Tool choice",
        createdAt: "2026-03-30T00:00:00.000Z",
        payload: {
          subject: "Tool choice",
          criteria: [],
          options: [
            { id: "a", name: "Alpha", score: 82 },
            { id: "b", name: "Beta", score: 91 },
            { id: "c", name: "Gamma", excluded: true, excludedReasons: ["Too expensive"] },
          ],
        },
        provenance: {
          producedBy: { app: "TradeoffLens" },
          sourceArtifacts: [],
          sourceScenario: { app: "TradeoffLens", scenarioId: "scenario-1" },
        },
      },
      {
        artifactId: "artifact-ranked",
        createdAt: "2026-03-30T00:10:00.000Z",
        producedByApp: "lens-workbench",
      }
    );

    expect(ranked.kind).toBe("RankedOptions");
    expect(ranked.payload.ranked.map((entry) => entry.optionName)).toEqual(["Beta", "Alpha"]);
    expect(ranked.payload.excluded[0]?.reasons).toEqual(["Too expensive"]);
    expect(ranked.provenance.sourceArtifacts[0]?.id).toBe("artifact-decision");
  });

  it("claimSetToEvidenceMapSeedTransform seeds an empty evidence map and carries provenance forward", () => {
    const inputClaims = [
      { id: "claim-1", statement: "The launch date is viable", category: "schedule" },
      { id: "claim-2", statement: "Support load is manageable", notes: "Needs validation." },
    ];
    const evidenceMap = claimSetToEvidenceMapSeedTransform.run(
      {
        id: "artifact-claims",
        kind: "ClaimSet",
        schemaVersion: 1,
        title: "Launch claims",
        createdAt: "2026-03-30T00:00:00.000Z",
        payload: {
          subject: "Launch claims",
          claims: inputClaims,
        },
        provenance: {
          producedBy: { app: "Threadline" },
          sourceArtifacts: [],
          sourceScenario: { app: "Threadline", scenarioId: "plan-1" },
        },
      },
      {
        artifactId: "artifact-evidence",
        createdAt: "2026-03-30T00:20:00.000Z",
        producedByApp: "EvidenceLedger",
      }
    );

    expect(evidenceMap.kind).toBe("EvidenceMap");
    expect(evidenceMap.payload.claims).toEqual(inputClaims);
    expect(evidenceMap.payload.sources).toEqual([]);
    expect(evidenceMap.payload.links).toEqual([]);
    expect(evidenceMap.provenance.producedBy.app).toBe("EvidenceLedger");
    expect(evidenceMap.provenance.producedBy.transformId).toBe("claim-set-to-evidence-map-seed");
    expect(evidenceMap.provenance.sourceArtifacts[0]?.id).toBe("artifact-claims");
    expect(evidenceMap.provenance.sourceArtifacts[0]?.title).toBe("Launch claims");
    expect(evidenceMap.provenance.sourceScenario?.app).toBe("Threadline");
  });

  it("executionPlanToClaimSetTransform projects only planning-pressure tasks into claims", () => {
    const claimSet = executionPlanToClaimSetTransform.run(
      {
        id: "artifact-plan",
        kind: "ExecutionPlan",
        schemaVersion: 1,
        title: "Launch execution plan",
        createdAt: "2026-03-30T00:00:00.000Z",
        payload: {
          subject: "Launch",
          deadlineDay: 20,
          projectFinishDay: 19,
          deadlineMissDays: 0,
          tasks: [
            {
              id: "critical",
              name: "Critical task",
              status: "active",
              notes: "Needs close coordination.",
              critical: true,
              constraintIssues: [],
            },
            {
              id: "deadline",
              name: "Deadline task",
              status: "todo",
              notes: "Still waiting on dry run feedback.",
              critical: false,
              constraintIssues: ["Must finish before day 10."],
            },
            {
              id: "critical-deadline",
              name: "Critical deadline task",
              status: "active",
              notes: "Both critical and constrained.",
              critical: true,
              constraintIssues: ["Must finish before day 8."],
            },
            {
              id: "ordinary",
              name: "Ordinary task",
              status: "todo",
              notes: "",
              critical: false,
              constraintIssues: [],
            },
            {
              id: "done",
              name: "Done task",
              status: "done",
              notes: "",
              critical: true,
              constraintIssues: ["Old issue."],
            },
          ],
        },
        provenance: {
          producedBy: { app: "Threadline" },
          sourceArtifacts: [],
          sourceScenario: { app: "Threadline", scenarioId: "scenario-1" },
        },
      },
      {
        artifactId: "artifact-claims",
        createdAt: "2026-03-30T00:30:00.000Z",
        producedByApp: "lens-workbench",
      }
    );

    expect(claimSet.kind).toBe("ClaimSet");
    expect(claimSet.payload.claims).toHaveLength(3);
    expect(claimSet.payload.claims).toEqual([
      {
        id: "claim-critical",
        statement: "Critical task is schedule-critical for delivering Launch.",
        category: "Critical path",
        notes: "Needs close coordination.",
      },
      {
        id: "claim-deadline",
        statement: "Deadline task is carrying explicit deadline pressure in the current plan for Launch.",
        category: "Deadline pressure",
        notes: "Still waiting on dry run feedback.\n\nMust finish before day 10.",
      },
      {
        id: "claim-critical-deadline",
        statement:
          "Critical deadline task is a schedule-critical task with explicit deadline pressure in the current plan for Launch.",
        category: "Critical deadline pressure",
        notes: "Both critical and constrained.\n\nMust finish before day 8.",
      },
    ]);
    expect(claimSet.payload.claims.some((claim) => claim.id === "claim-ordinary")).toBe(false);
    expect(claimSet.payload.claims.some((claim) => claim.id === "claim-done")).toBe(false);
    expect(claimSet.provenance.producedBy.app).toBe("lens-workbench");
    expect(claimSet.provenance.producedBy.transformId).toBe("execution-plan-to-claim-set");
    expect(claimSet.provenance.sourceArtifacts[0]?.id).toBe("artifact-plan");
    expect(claimSet.provenance.sourceArtifacts[0]?.title).toBe("Launch execution plan");
    expect(claimSet.provenance.sourceScenario?.app).toBe("Threadline");
  });

  it("looks up the named recipe and resolves valid transform ids in order", () => {
    const recipe = getLensRecipe("threadline-plan-pressure-to-evidence-map");

    expect(recipe).toBeDefined();
    expect(recipe?.label).toBe("Plan pressure to evidence seed");
    expect(recipe?.startKind).toBe("ExecutionPlan");
    expect(recipe?.targetKind).toBe("EvidenceMap");

    expect(recipe).toBeDefined();

    const transforms = recipe!.transformIds.map((transformId) => getLensTransformById(transformId));

    expect(transforms).toHaveLength(2);
    expect(transforms[0]?.id).toBe("execution-plan-to-claim-set");
    expect(transforms[1]?.id).toBe("claim-set-to-evidence-map-seed");
    expect(transforms.every(Boolean)).toBe(true);
  });

  it("supports the current recipe chain from ExecutionPlan to EvidenceMap", () => {
    const recipe = getLensRecipe("threadline-plan-pressure-to-evidence-map");

    expect(recipe).toBeDefined();

    let currentKind = recipe!.startKind;

    for (const transformId of recipe!.transformIds) {
      const transform = getLensTransformById(transformId);

      expect(transform).toBeDefined();
      expect(transform?.inputKind).toBe(currentKind);
      currentKind = transform!.outputKind;
    }

    expect(currentKind).toBe(recipe!.targetKind);
  });
});
