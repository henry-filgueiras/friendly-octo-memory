import { clamp, formatNumber } from "./helpers";
import type {
  AnalysisResult,
  Candidate,
  CandidateScore,
  CandidateValue,
  Criterion,
  CriterionContribution,
  DecisionScenario,
  Direction,
  DominancePair,
  FrontierPoint,
  NumericCriterion,
  NumericCriterionMeta,
  PairwiseCell,
} from "./types";

const EPSILON = 1e-9;

function isFiniteNumber(value: CandidateValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isScoredCriterion(criterion: Criterion): boolean {
  return criterion.type !== "note" && criterion.weight > 0;
}

export function normalizeNumericValue(
  value: number,
  min: number,
  max: number,
  direction: Direction
): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }

  if (Math.abs(max - min) < EPSILON) {
    return 1;
  }

  const ratio =
    direction === "maximize"
      ? (value - min) / (max - min)
      : (max - value) / (max - min);

  return clamp(ratio, 0, 1);
}

function formatValue(value: CandidateValue): string {
  if (value === null || value === "") {
    return "Unset";
  }

  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  return value;
}

function getConstraintReasons(candidate: Candidate, criterion: Criterion): string[] {
  if (!criterion.constraintEnabled) {
    return [];
  }

  const value = candidate.values[criterion.id];

  switch (criterion.type) {
    case "numeric": {
      if (!isFiniteNumber(value)) {
        return [`${criterion.name} needs a numeric value to evaluate the hard constraint.`];
      }

      const reasons: string[] = [];

      if (criterion.minConstraint !== null && value < criterion.minConstraint) {
        reasons.push(`${criterion.name} must be at least ${formatNumber(criterion.minConstraint)}.`);
      }

      if (criterion.maxConstraint !== null && value > criterion.maxConstraint) {
        reasons.push(`${criterion.name} must be at most ${formatNumber(criterion.maxConstraint)}.`);
      }

      return reasons;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return [`${criterion.name} must be explicitly set for the hard constraint.`];
      }

      if (value !== criterion.requiredValue) {
        return [`${criterion.name} must be ${criterion.requiredValue ? "true" : "false"}.`];
      }

      return [];
    }
    case "enum": {
      if (typeof value !== "string" || value.trim().length === 0) {
        return [`${criterion.name} must be set to one of the allowed values.`];
      }

      if (!criterion.allowedValues.includes(value)) {
        return [
          `${criterion.name} must be one of: ${criterion.allowedValues.join(", ") || "none selected"}.`,
        ];
      }

      return [];
    }
    case "note":
      return [];
  }
}

function buildNumericMeta(
  criteria: Criterion[],
  candidates: Candidate[]
): Record<string, NumericCriterionMeta> {
  const numericMetaByCriterionId: Record<string, NumericCriterionMeta> = {};

  criteria.forEach((criterion) => {
    if (criterion.type !== "numeric" || criterion.weight <= 0) {
      return;
    }

    const values = candidates
      .map((candidate) => candidate.values[criterion.id])
      .filter(isFiniteNumber);

    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;

    numericMetaByCriterionId[criterion.id] = {
      criterionId: criterion.id,
      min,
      max,
      hasSpread: Math.abs(max - min) >= EPSILON,
    };
  });

  return numericMetaByCriterionId;
}

function getEnumUtility(candidateValue: CandidateValue, criterion: Criterion): number {
  if (criterion.type !== "enum") {
    return 0;
  }

  if (typeof candidateValue !== "string") {
    return 0;
  }

  const option = criterion.options.find((entry) => entry.label === candidateValue);
  return option ? clamp(option.score / 100, 0, 1) : 0;
}

function getBooleanUtility(candidateValue: CandidateValue, criterion: Criterion): number {
  if (criterion.type !== "boolean" || typeof candidateValue !== "boolean") {
    return 0;
  }

  const preferredValue = criterion.direction === "maximize";
  return candidateValue === preferredValue ? 1 : 0;
}

function getNumericUtility(
  candidateValue: CandidateValue,
  criterion: NumericCriterion,
  numericMetaByCriterionId: Record<string, NumericCriterionMeta>
): number {
  if (!isFiniteNumber(candidateValue)) {
    return 0;
  }

  const meta = numericMetaByCriterionId[criterion.id];
  return normalizeNumericValue(candidateValue, meta.min, meta.max, criterion.direction);
}

function getUtility(
  candidateValue: CandidateValue,
  criterion: Criterion,
  numericMetaByCriterionId: Record<string, NumericCriterionMeta>
): { utility: number; normalizedValue: number | null; displayValue: string } {
  switch (criterion.type) {
    case "numeric": {
      const utility = getNumericUtility(candidateValue, criterion, numericMetaByCriterionId);
      return {
        utility,
        normalizedValue: utility,
        displayValue: formatValue(candidateValue),
      };
    }
    case "boolean": {
      const utility = getBooleanUtility(candidateValue, criterion);
      return {
        utility,
        normalizedValue: utility,
        displayValue: formatValue(candidateValue),
      };
    }
    case "enum": {
      const utility = getEnumUtility(candidateValue, criterion);
      return {
        utility,
        normalizedValue: utility,
        displayValue: formatValue(candidateValue),
      };
    }
    case "note":
      return {
        utility: 0,
        normalizedValue: null,
        displayValue: formatValue(candidateValue),
      };
  }
}

function buildCandidateScore(
  candidate: Candidate,
  criteria: Criterion[],
  totalActiveWeight: number,
  numericMetaByCriterionId: Record<string, NumericCriterionMeta>
): CandidateScore {
  const contributions: CriterionContribution[] = [];
  const utilityByCriterionId: Record<string, number> = {};

  criteria.forEach((criterion) => {
    if (!isScoredCriterion(criterion)) {
      return;
    }

    const value = candidate.values[criterion.id] ?? null;
    const { utility, normalizedValue, displayValue } = getUtility(
      value,
      criterion,
      numericMetaByCriterionId
    );
    const weightedPoints = utility * criterion.weight;

    utilityByCriterionId[criterion.id] = utility;
    contributions.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      criterionType: criterion.type,
      weight: criterion.weight,
      rawValue: value,
      utility,
      normalizedValue,
      weightedPoints,
      displayValue,
    });
  });

  const totalWeightedPoints = contributions.reduce(
    (sum, contribution) => sum + contribution.weightedPoints,
    0
  );

  return {
    candidate,
    totalWeightedPoints,
    totalScore: totalActiveWeight > 0 ? (totalWeightedPoints / totalActiveWeight) * 100 : 0,
    contributions,
    utilityByCriterionId,
    rank: 0,
  };
}

function detectDominance(
  ranking: CandidateScore[],
  criteria: Criterion[]
): DominancePair[] {
  const scoredCriteria = criteria.filter(isScoredCriterion);
  const pairs: DominancePair[] = [];

  if (scoredCriteria.length === 0) {
    return pairs;
  }

  ranking.forEach((rowCandidate) => {
    ranking.forEach((columnCandidate) => {
      if (rowCandidate.candidate.id === columnCandidate.candidate.id) {
        return;
      }

      const allEqualOrBetter = scoredCriteria.every((criterion) => {
        const rowUtility = rowCandidate.utilityByCriterionId[criterion.id] ?? 0;
        const columnUtility = columnCandidate.utilityByCriterionId[criterion.id] ?? 0;
        return rowUtility + EPSILON >= columnUtility;
      });

      const strictlyBetterSomewhere = scoredCriteria.some((criterion) => {
        const rowUtility = rowCandidate.utilityByCriterionId[criterion.id] ?? 0;
        const columnUtility = columnCandidate.utilityByCriterionId[criterion.id] ?? 0;
        return rowUtility > columnUtility + EPSILON;
      });

      if (allEqualOrBetter && strictlyBetterSomewhere) {
        pairs.push({
          dominatorId: rowCandidate.candidate.id,
          dominatedId: columnCandidate.candidate.id,
        });
      }
    });
  });

  return pairs;
}

function buildPairwise(
  ranking: CandidateScore[],
  dominancePairs: DominancePair[]
): PairwiseCell[] {
  const dominanceLookup = new Map(
    dominancePairs.map((pair) => [`${pair.dominatorId}:${pair.dominatedId}`, true])
  );

  return ranking.flatMap((rowCandidate) =>
    ranking.map((columnCandidate) => {
      const delta = rowCandidate.totalScore - columnCandidate.totalScore;
      const dominance = dominanceLookup.get(
        `${rowCandidate.candidate.id}:${columnCandidate.candidate.id}`
      )
        ? "row"
        : dominanceLookup.get(`${columnCandidate.candidate.id}:${rowCandidate.candidate.id}`)
          ? "column"
          : null;

      return {
        rowCandidateId: rowCandidate.candidate.id,
        columnCandidateId: columnCandidate.candidate.id,
        delta,
        winnerId:
          Math.abs(delta) < EPSILON
            ? null
            : delta > 0
              ? rowCandidate.candidate.id
              : columnCandidate.candidate.id,
        dominance,
      } satisfies PairwiseCell;
    })
  );
}

export function analyzeScenario(
  scenario: DecisionScenario,
  weightOverrides: Record<string, number> = {}
): AnalysisResult {
  const criteria = scenario.criteria.map((criterion) =>
    isScoredCriterion(criterion)
      ? {
          ...criterion,
          weight: clamp(weightOverrides[criterion.id] ?? criterion.weight, 0, 100),
        }
      : criterion
  );

  const excluded = scenario.candidates
    .map((candidate) => ({
      candidate,
      reasons: criteria.flatMap((criterion) => getConstraintReasons(candidate, criterion)),
    }))
    .filter((entry) => entry.reasons.length > 0);

  const includedCandidates = scenario.candidates.filter(
    (candidate) => !excluded.some((entry) => entry.candidate.id === candidate.id)
  );

  const numericMetaByCriterionId = buildNumericMeta(criteria, includedCandidates);
  const totalActiveWeight = criteria
    .filter(isScoredCriterion)
    .reduce((sum, criterion) => sum + criterion.weight, 0);

  const ranking = includedCandidates
    .map((candidate) =>
      buildCandidateScore(candidate, criteria, totalActiveWeight, numericMetaByCriterionId)
    )
    .sort((left, right) => {
      if (Math.abs(right.totalScore - left.totalScore) > EPSILON) {
        return right.totalScore - left.totalScore;
      }

      return left.candidate.name.localeCompare(right.candidate.name);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

  const dominancePairs = detectDominance(ranking, criteria);
  const pairwise = buildPairwise(ranking, dominancePairs);

  return {
    ranking,
    excluded,
    numericMetaByCriterionId,
    totalActiveWeight,
    dominancePairs,
    pairwise,
  };
}

export function getDominatedIds(
  dominancePairs: DominancePair[],
  dominatorId: string
): string[] {
  return dominancePairs
    .filter((pair) => pair.dominatorId === dominatorId)
    .map((pair) => pair.dominatedId);
}

export function getDominators(
  dominancePairs: DominancePair[],
  candidateId: string
): string[] {
  return dominancePairs
    .filter((pair) => pair.dominatedId === candidateId)
    .map((pair) => pair.dominatorId);
}

export function computeParetoFrontier(
  scenario: DecisionScenario,
  analysis: AnalysisResult,
  xCriterionId: string,
  yCriterionId: string
): FrontierPoint[] {
  const xCriterion = scenario.criteria.find(
    (criterion): criterion is NumericCriterion =>
      criterion.id === xCriterionId && criterion.type === "numeric"
  );
  const yCriterion = scenario.criteria.find(
    (criterion): criterion is NumericCriterion =>
      criterion.id === yCriterionId && criterion.type === "numeric"
  );

  if (!xCriterion || !yCriterion) {
    return [];
  }

  const points: FrontierPoint[] = [];

  analysis.ranking.forEach((entry) => {
    const xValue = entry.candidate.values[xCriterionId];
    const yValue = entry.candidate.values[yCriterionId];

    if (!isFiniteNumber(xValue) || !isFiniteNumber(yValue)) {
      return;
    }

    const xUtility = getNumericUtility(xValue, xCriterion, analysis.numericMetaByCriterionId);
    const yUtility = getNumericUtility(yValue, yCriterion, analysis.numericMetaByCriterionId);

    points.push({
      candidateId: entry.candidate.id,
      candidateName: entry.candidate.name,
      xCriterionId,
      yCriterionId,
      xValue,
      yValue,
      xUtility,
      yUtility,
      onFrontier: false,
    });
  });

  return points.map((point) => {
    const dominated = points.some((otherPoint) => {
      if (otherPoint.candidateId === point.candidateId) {
        return false;
      }

      const equalOrBetter =
        otherPoint.xUtility + EPSILON >= point.xUtility &&
        otherPoint.yUtility + EPSILON >= point.yUtility;
      const strictlyBetter =
        otherPoint.xUtility > point.xUtility + EPSILON ||
        otherPoint.yUtility > point.yUtility + EPSILON;

      return equalOrBetter && strictlyBetter;
    });

    return {
      ...point,
      onFrontier: !dominated,
    };
  });
}
