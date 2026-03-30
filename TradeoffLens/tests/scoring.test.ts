import { describe, expect, it } from "vitest";
import {
  analyzeScenario,
  computeParetoFrontier,
  normalizeNumericValue,
} from "../src/domain/scoring";
import { syncScenario, updateEnumOptionLabels } from "../src/domain/helpers";
import type { DecisionScenario } from "../src/domain/types";

function createScenario(): DecisionScenario {
  return {
    id: "scenario-1",
    name: "Test scenario",
    description: "Scenario used by unit tests.",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    criteria: [
      {
        id: "price",
        name: "Price",
        type: "numeric",
        direction: "minimize",
        weight: 70,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
      {
        id: "quality",
        name: "Quality",
        type: "numeric",
        direction: "maximize",
        weight: 30,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
    ],
    candidates: [
      {
        id: "a",
        name: "A",
        notes: "",
        values: {
          price: 10,
          quality: 70,
        },
      },
      {
        id: "b",
        name: "B",
        notes: "",
        values: {
          price: 20,
          quality: 90,
        },
      },
      {
        id: "c",
        name: "C",
        notes: "",
        values: {
          price: 12,
          quality: 75,
        },
      },
    ],
  };
}

function createDominanceScenario(): DecisionScenario {
  return {
    id: "scenario-2",
    name: "Dominance scenario",
    description: "Purpose-built scenario for dominance tests.",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    criteria: [
      {
        id: "speed",
        name: "Speed",
        type: "numeric",
        direction: "maximize",
        weight: 50,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
      {
        id: "cost",
        name: "Cost",
        type: "numeric",
        direction: "minimize",
        weight: 50,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
    ],
    candidates: [
      {
        id: "dominant",
        name: "Dominant",
        notes: "",
        values: {
          speed: 95,
          cost: 10,
        },
      },
      {
        id: "dominated",
        name: "Dominated",
        notes: "",
        values: {
          speed: 70,
          cost: 18,
        },
      },
      {
        id: "tradeoff",
        name: "Tradeoff",
        notes: "",
        values: {
          speed: 100,
          cost: 25,
        },
      },
    ],
  };
}

function createEnumScenario(): DecisionScenario {
  return {
    id: "scenario-3",
    name: "Enum scenario",
    description: "Scenario used for enum stability tests.",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    criteria: [
      {
        id: "fit",
        name: "Fit",
        type: "enum",
        weight: 50,
        constraintEnabled: true,
        options: [
          { id: "fit-high", label: "High", score: 100 },
          { id: "fit-medium", label: "Medium", score: 60 },
          { id: "fit-low", label: "Low", score: 20 },
        ],
        allowedValues: ["fit-high", "fit-medium"],
      },
    ],
    candidates: [
      {
        id: "a",
        name: "A",
        notes: "",
        values: {
          fit: "fit-medium",
        },
      },
    ],
  };
}

function createZeroWeightFrontierScenario(): DecisionScenario {
  return {
    id: "scenario-4",
    name: "Zero-weight frontier",
    description: "Scenario used for frontier tests.",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    criteria: [
      {
        id: "speed",
        name: "Speed",
        type: "numeric",
        direction: "maximize",
        weight: 100,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
      {
        id: "price",
        name: "Price",
        type: "numeric",
        direction: "minimize",
        weight: 0,
        constraintEnabled: false,
        minConstraint: null,
        maxConstraint: null,
      },
    ],
    candidates: [
      {
        id: "a",
        name: "A",
        notes: "",
        values: { speed: 80, price: 10 },
      },
      {
        id: "b",
        name: "B",
        notes: "",
        values: { speed: 90, price: 20 },
      },
      {
        id: "c",
        name: "C",
        notes: "",
        values: { speed: 100, price: 30 },
      },
    ],
  };
}

describe("normalizeNumericValue", () => {
  it("normalizes maximize criteria", () => {
    expect(normalizeNumericValue(15, 10, 20, "maximize")).toBeCloseTo(0.5);
  });

  it("normalizes minimize criteria", () => {
    expect(normalizeNumericValue(15, 10, 20, "minimize")).toBeCloseTo(0.5);
  });

  it("returns 1 when every value is identical", () => {
    expect(normalizeNumericValue(5, 5, 5, "maximize")).toBe(1);
  });
});

describe("analyzeScenario", () => {
  it("computes weighted scores deterministically", () => {
    const analysis = analyzeScenario(createScenario());

    expect(analysis.ranking.map((entry) => entry.candidate.id)).toEqual(["a", "c", "b"]);
    expect(analysis.ranking[0].totalScore).toBeCloseTo(70);
    expect(analysis.ranking[1].totalScore).toBeCloseTo(63.5);
    expect(analysis.ranking[2].totalScore).toBeCloseTo(30);
  });

  it("excludes candidates that fail hard constraints", () => {
    const scenario = createScenario();
    scenario.criteria = [
      ...scenario.criteria,
      {
        id: "supported",
        name: "Supported",
        type: "boolean",
        direction: "maximize",
        weight: 10,
        constraintEnabled: true,
        requiredValue: true,
      },
      {
        id: "effort",
        name: "Effort",
        type: "numeric",
        direction: "minimize",
        weight: 0,
        constraintEnabled: true,
        minConstraint: null,
        maxConstraint: 8,
      },
    ];

    scenario.candidates[0].values.supported = true;
    scenario.candidates[0].values.effort = 7;
    scenario.candidates[1].values.supported = false;
    scenario.candidates[1].values.effort = 7;
    scenario.candidates[2].values.supported = true;
    scenario.candidates[2].values.effort = 9;

    const analysis = analyzeScenario(scenario);

    expect(analysis.ranking.map((entry) => entry.candidate.id)).toEqual(["a"]);
    expect(analysis.excluded).toHaveLength(2);
    expect(analysis.excluded.find((entry) => entry.candidate.id === "b")?.reasons).toContain(
      "Supported must be true."
    );
    expect(analysis.excluded.find((entry) => entry.candidate.id === "c")?.reasons).toContain(
      "Effort must be at most 8."
    );
  });

  it("detects dominance when one candidate is never worse and sometimes better", () => {
    const analysis = analyzeScenario(createDominanceScenario());

    expect(
      analysis.dominancePairs.some(
        (pair) => pair.dominatorId === "dominant" && pair.dominatedId === "dominated"
      )
    ).toBe(true);
    expect(
      analysis.dominancePairs.some(
        (pair) => pair.dominatorId === "dominant" && pair.dominatedId === "tradeoff"
      )
    ).toBe(false);
  });

  it("recomputes rankings when sensitivity overrides change the weights", () => {
    const scenario = createScenario();

    const baseline = analyzeScenario(scenario);
    const shifted = analyzeScenario(scenario, {
      price: 20,
      quality: 80,
    });

    expect(baseline.ranking[0].candidate.id).toBe("a");
    expect(shifted.ranking[0].candidate.id).toBe("b");
    expect(shifted.ranking.map((entry) => entry.candidate.id)).toEqual(["b", "c", "a"]);
  });
});

describe("enum stability", () => {
  it("renaming an enum option does not change candidate selections", () => {
    const scenario = createEnumScenario();
    const criterion = scenario.criteria[0];

    if (criterion.type !== "enum") {
      throw new Error("Expected enum criterion");
    }

    const renamed = updateEnumOptionLabels(criterion, [
      { ...criterion.options[0], label: "Excellent" },
      ...criterion.options.slice(1),
    ]);
    const synced = syncScenario({
      ...scenario,
      criteria: [renamed],
    });

    expect(synced.candidates[0].values.fit).toBe("fit-medium");
  });

  it("renaming an enum option does not clear allowed constraint values", () => {
    const scenario = createEnumScenario();
    const criterion = scenario.criteria[0];

    if (criterion.type !== "enum") {
      throw new Error("Expected enum criterion");
    }

    const renamed = updateEnumOptionLabels(criterion, criterion.options.map((option) =>
      option.id === "fit-high" ? { ...option, label: "Excellent" } : option
    ));

    expect(renamed.allowedValues).toEqual(["fit-high", "fit-medium"]);
  });
});

describe("computeParetoFrontier", () => {
  it("supports zero-weight numeric criteria in frontier analysis", () => {
    const scenario = createZeroWeightFrontierScenario();
    const analysis = analyzeScenario(scenario);
    const points = computeParetoFrontier(scenario, analysis, "price", "speed");

    expect(points).toHaveLength(3);
    expect(points.map((point) => point.candidateId)).toEqual(["c", "b", "a"]);
    expect(points.find((point) => point.candidateId === "a")?.xUtility).toBeCloseTo(1);
    expect(points.find((point) => point.candidateId === "b")?.xUtility).toBeCloseTo(0.5);
    expect(points.find((point) => point.candidateId === "c")?.xUtility).toBeCloseTo(0);
  });
});
