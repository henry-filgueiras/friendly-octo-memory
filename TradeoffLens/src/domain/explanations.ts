import { formatNumber } from "./helpers";
import { getDominatedIds, getDominators } from "./scoring";
import type {
  AnalysisResult,
  CandidateValue,
  CandidateExplanation,
  Criterion,
  DecisionScenario,
  NumericCriterionMeta,
} from "./types";

function describeTopContributions(names: string[]): string {
  if (names.length === 0) {
    return "It does not have any weighted criteria yet.";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function buildImprovementHint(
  criterion: Criterion,
  selectedValue: unknown,
  leaderValue: unknown,
  numericMeta?: NumericCriterionMeta
): string {
  switch (criterion.type) {
    case "numeric": {
      if (typeof selectedValue !== "number" || typeof leaderValue !== "number") {
        return `fill in ${criterion.name}`;
      }

      if (!numericMeta?.hasSpread) {
        return `improve ${criterion.name}`;
      }

      if (criterion.direction === "maximize") {
        return `raise ${criterion.name} from ${formatNumber(selectedValue)} toward ${formatNumber(leaderValue)}`;
      }

      return `lower ${criterion.name} from ${formatNumber(selectedValue)} toward ${formatNumber(leaderValue)}`;
    }
    case "boolean": {
      const desired = criterion.direction === "maximize";
      return `set ${criterion.name} to ${desired ? "true" : "false"}`;
    }
    case "enum":
      return `shift ${criterion.name} toward ${String(leaderValue || "a higher-scoring option")}`;
    case "note":
      return `clarify ${criterion.name}`;
  }
}

export function explainCandidate(
  scenario: DecisionScenario,
  analysis: AnalysisResult,
  candidateId: string | null
): CandidateExplanation {
  if (!candidateId) {
    return {
      title: "No candidate selected",
      summary: "Pick a candidate to see a plain-English breakdown of rank, tradeoffs, and possible paths to the top.",
      helpedMost: [],
      hurtMost: [],
      overtakePlan: "The overtake analysis appears once at least one candidate is selected.",
      excludedReasons: [],
    };
  }

  const excluded = analysis.excluded.find((entry) => entry.candidate.id === candidateId);

  if (excluded) {
    return {
      title: `${excluded.candidate.name} is excluded`,
      summary: `${excluded.candidate.name} does not enter the ranking because it fails ${excluded.reasons.length} hard constraint${excluded.reasons.length === 1 ? "" : "s"}.`,
      helpedMost: [],
      hurtMost: [],
      overtakePlan: "Resolve the hard-constraint failures first; weighted ranking only applies after a candidate becomes eligible.",
      excludedReasons: excluded.reasons,
    };
  }

  const current = analysis.ranking.find((entry) => entry.candidate.id === candidateId);

  if (!current) {
    return {
      title: "Candidate not found",
      summary: "This candidate is not present in the current scenario anymore.",
      helpedMost: [],
      hurtMost: [],
      overtakePlan: "Add or restore the candidate to bring the explanation back.",
      excludedReasons: [],
    };
  }

  const helpedMost = [...current.contributions]
    .sort((left, right) => right.weightedPoints - left.weightedPoints)
    .slice(0, 3)
    .map((entry) => entry.criterionName);
  const hurtMost = [...current.contributions]
    .sort((left, right) => {
      if (Math.abs(left.utility - right.utility) > 1e-9) {
        return left.utility - right.utility;
      }

      return right.weight - left.weight;
    })
    .slice(0, 3)
    .map((entry) => entry.criterionName);

  const dominatedBy = getDominators(analysis.dominancePairs, current.candidate.id).length;
  const dominates = getDominatedIds(analysis.dominancePairs, current.candidate.id).length;
  const leader = analysis.ranking[0];

  const summary =
    current.rank === 1
      ? `${current.candidate.name} ranks first out of ${analysis.ranking.length} eligible candidates with a score of ${formatNumber(current.totalScore)}. Its strongest support comes from ${describeTopContributions(helpedMost)}.`
      : `${current.candidate.name} ranks ${current.rank} of ${analysis.ranking.length} eligible candidates with a score of ${formatNumber(current.totalScore)}. It gains the most from ${describeTopContributions(helpedMost)} and loses the most ground on ${describeTopContributions(hurtMost)}. It currently dominates ${dominates} candidate${dominates === 1 ? "" : "s"} and is dominated by ${dominatedBy}.`;

  if (!leader || leader.candidate.id === current.candidate.id) {
    return {
      title: `${current.candidate.name} leads the field`,
      summary,
      helpedMost,
      hurtMost,
      overtakePlan: "It already leads. To keep the lead, watch the lowest-utility criteria because small changes there are the likeliest way to create a tie or upset.",
      excludedReasons: [],
    };
  }

  const deficits: Array<{
    criterion: Criterion;
    delta: number;
    selectedValue: CandidateValue;
    leaderValue: CandidateValue;
  }> = [];

  leader.contributions.forEach((leaderContribution) => {
    const currentContribution = current.contributions.find(
      (entry) => entry.criterionId === leaderContribution.criterionId
    );
    const criterion = scenario.criteria.find(
      (entry) => entry.id === leaderContribution.criterionId
    );

    if (!criterion || !currentContribution) {
      return;
    }

    const delta = leaderContribution.weightedPoints - currentContribution.weightedPoints;

    if (delta <= 0) {
      return;
    }

    deficits.push({
      criterion,
      delta,
      selectedValue: currentContribution.rawValue,
      leaderValue: leaderContribution.rawValue,
    });
  });

  deficits.sort((left, right) => right.delta - left.delta);

  const topMoves = deficits
    .slice(0, 3)
    .map((entry) =>
      buildImprovementHint(
        entry.criterion,
        entry.selectedValue,
        entry.leaderValue,
        analysis.numericMetaByCriterionId[entry.criterion.id]
      )
    );
  const gap = leader.totalScore - current.totalScore;

  return {
    title: `${current.candidate.name} versus ${leader.candidate.name}`,
    summary,
    helpedMost,
    hurtMost,
    overtakePlan:
      topMoves.length === 0
        ? `It trails ${leader.candidate.name} by ${formatNumber(gap)} points, but the gap is spread thinly across many criteria. Changing the weights is more likely to flip the order than improving one single factor.`
        : `To overtake ${leader.candidate.name}, ${current.candidate.name} needs to close about ${formatNumber(gap)} points. The biggest levers are to ${describeTopContributions(topMoves)}.`,
    excludedReasons: [],
  };
}
