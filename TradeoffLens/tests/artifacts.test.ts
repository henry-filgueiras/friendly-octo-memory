import { describe, expect, it } from "vitest";
import { buildDecisionModelArtifact, buildRankedOptionsArtifact } from "../src/domain/artifacts";
import { syncScenario } from "../src/domain/helpers";
import { analyzeScenario } from "../src/domain/scoring";
import type { DecisionScenario } from "../src/domain/types";

function createScenario(): DecisionScenario {
  return syncScenario({
    id: "scenario-artifacts",
    name: "Tool decision",
    description: "Artifact export coverage.",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    criteria: [
      {
        id: "price",
        name: "Price",
        type: "numeric",
        direction: "minimize",
        weight: 60,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
      {
        id: "supported",
        name: "Supported",
        type: "boolean",
        direction: "maximize",
        weight: 40,
        constraintEnabled: true,
        requiredValue: true,
      },
    ],
    candidates: [
      {
        id: "alpha",
        name: "Alpha",
        notes: "",
        values: {
          price: 10,
          supported: true,
        },
      },
      {
        id: "beta",
        name: "Beta",
        notes: "",
        values: {
          price: 20,
          supported: true,
        },
      },
      {
        id: "gamma",
        name: "Gamma",
        notes: "",
        values: {
          price: 5,
          supported: false,
        },
      },
    ],
  });
}

describe("artifact exports", () => {
  it("exports a decision model artifact with ranked and excluded option metadata", () => {
    const scenario = createScenario();
    const analysis = analyzeScenario(scenario);
    const artifact = buildDecisionModelArtifact(scenario, analysis, { price: 55 });

    expect(artifact.kind).toBe("DecisionModel");
    expect(artifact.payload.criteria[0]?.weight).toBe(55);
    expect(artifact.payload.options.find((option) => option.id === "alpha")?.score).toBeGreaterThan(
      artifact.payload.options.find((option) => option.id === "beta")?.score ?? 0
    );
    expect(artifact.payload.options.find((option) => option.id === "gamma")?.excluded).toBe(true);
    expect(artifact.provenance.sourceScenario?.scenarioId).toBe("scenario-artifacts");
  });

  it("exports ranked options with excluded reasons", () => {
    const scenario = createScenario();
    const analysis = analyzeScenario(scenario);
    const artifact = buildRankedOptionsArtifact(scenario, analysis);

    expect(artifact.kind).toBe("RankedOptions");
    expect(artifact.payload.ranked.map((entry) => entry.optionName)).toEqual(["Alpha", "Beta"]);
    expect(artifact.payload.excluded[0]?.optionName).toBe("Gamma");
    expect(artifact.payload.excluded[0]?.reasons[0]).toContain("must be true");
  });
});
