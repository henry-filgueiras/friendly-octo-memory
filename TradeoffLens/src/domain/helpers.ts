import type {
  Candidate,
  CandidateValue,
  Criterion,
  CriterionType,
  DecisionScenario,
  EnumCriterion,
  EnumOption,
} from "./types";

export function createId(prefix = "tl"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createCandidate(name = "New candidate"): Candidate {
  return {
    id: createId("candidate"),
    name,
    notes: "",
    values: {},
  };
}

function createEnumOptions(): EnumOption[] {
  return [
    { id: createId("option"), label: "High", score: 100 },
    { id: createId("option"), label: "Medium", score: 60 },
    { id: createId("option"), label: "Low", score: 20 },
  ];
}

export function createCriterion(type: CriterionType = "numeric"): Criterion {
  const base = {
    id: createId("criterion"),
    name: "New criterion",
    weight: type === "note" ? 0 : 50,
    constraintEnabled: false,
  };

  switch (type) {
    case "numeric":
      return {
        ...base,
        type,
        direction: "maximize",
        minConstraint: null,
        maxConstraint: null,
      };
    case "boolean":
      return {
        ...base,
        type,
        direction: "maximize",
        requiredValue: true,
      };
    case "enum":
      return {
        ...base,
        type,
        options: createEnumOptions(),
        allowedValues: [],
      };
    case "note":
      return {
        ...base,
        type,
        constraintEnabled: false,
      };
  }
}

export function getDefaultValueForCriterion(criterion: Criterion): CandidateValue {
  switch (criterion.type) {
    case "numeric":
      return null;
    case "boolean":
      return null;
    case "enum":
      return criterion.options[0]?.id ?? "";
    case "note":
      return "";
  }
}

export function getEnumOptionByValue(
  criterion: EnumCriterion,
  value: CandidateValue
): EnumOption | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return criterion.options.find(
    (option) => option.id === value || option.label === value
  );
}

export function getEnumOptionLabel(
  criterion: EnumCriterion,
  value: CandidateValue
): string {
  if (value === null || value === "") {
    return "Unset";
  }

  const option = getEnumOptionByValue(criterion, value);
  return option?.label ?? String(value);
}

function normalizeEnumStoredValue(
  criterion: EnumCriterion,
  value: CandidateValue
): string {
  if (value === "") {
    return "";
  }

  const option = getEnumOptionByValue(criterion, value);

  if (option) {
    return option.id;
  }

  return criterion.options[0]?.id ?? "";
}

function normalizeEnumAllowedValues(criterion: EnumCriterion): string[] {
  const normalized = criterion.allowedValues
    .map((value) => getEnumOptionByValue(criterion, value)?.id ?? null)
    .filter((value): value is string => value !== null);

  return Array.from(new Set(normalized));
}

export function convertCriterionType(
  criterion: Criterion,
  nextType: CriterionType
): Criterion {
  const converted = createCriterion(nextType);

  return {
    ...converted,
    id: criterion.id,
    name: criterion.name,
    weight: nextType === "note" ? 0 : criterion.weight,
  };
}

export function cloneCandidate(candidate: Candidate): Candidate {
  return {
    ...candidate,
    id: createId("candidate"),
    name: `${candidate.name} copy`,
    values: { ...candidate.values },
  };
}

export function syncScenario(scenario: DecisionScenario): DecisionScenario {
  const criteria = scenario.criteria.map((criterion) => {
    if (criterion.type !== "enum") {
      return criterion;
    }

    return {
      ...criterion,
      allowedValues: normalizeEnumAllowedValues(criterion),
    };
  });

  const candidates = scenario.candidates.map((candidate) => {
    const values: Record<string, CandidateValue> = {};

    criteria.forEach((criterion) => {
      const currentValue = candidate.values[criterion.id];
      values[criterion.id] =
        currentValue === undefined
          ? getDefaultValueForCriterion(criterion)
          : criterion.type === "enum"
            ? normalizeEnumStoredValue(criterion, currentValue)
            : currentValue;
    });

    return {
      ...candidate,
      values,
    };
  });

  return {
    ...scenario,
    criteria,
    candidates,
  };
}

export function touchScenario(scenario: DecisionScenario): DecisionScenario {
  return {
    ...syncScenario(scenario),
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyScenario(): DecisionScenario {
  const now = new Date().toISOString();

  return {
    id: createId("scenario"),
    name: "Untitled decision",
    description: "Compare options with explicit weights, constraints, and explanations.",
    candidates: [],
    criteria: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createScenarioFromSeed(
  seed: Omit<DecisionScenario, "id" | "createdAt" | "updatedAt">
): DecisionScenario {
  const now = new Date().toISOString();

  return syncScenario({
    ...seed,
    id: createId("scenario"),
    createdAt: now,
    updatedAt: now,
  });
}

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2).replace(/\.00$/, "");
}

export function updateEnumOptionLabels(
  criterion: EnumCriterion,
  nextOptions: EnumOption[]
): EnumCriterion {
  const allowedLookup = new Set(criterion.allowedValues);
  const allowedValues = nextOptions
    .map((option) => option.id)
    .filter((id) => allowedLookup.has(id));

  return {
    ...criterion,
    options: nextOptions,
    allowedValues,
  };
}
