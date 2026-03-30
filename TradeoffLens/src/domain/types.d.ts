export type CriterionType = "numeric" | "boolean" | "enum" | "note";
export type Direction = "maximize" | "minimize";
export type CandidateValue = number | boolean | string | null;
export interface Candidate {
    id: string;
    name: string;
    notes: string;
    values: Record<string, CandidateValue>;
}
interface BaseCriterion {
    id: string;
    name: string;
    weight: number;
    constraintEnabled: boolean;
}
export interface NumericCriterion extends BaseCriterion {
    type: "numeric";
    direction: Direction;
    minConstraint: number | null;
    maxConstraint: number | null;
}
export interface BooleanCriterion extends BaseCriterion {
    type: "boolean";
    direction: Direction;
    requiredValue: boolean;
}
export interface EnumOption {
    id: string;
    label: string;
    score: number;
}
export interface EnumCriterion extends BaseCriterion {
    type: "enum";
    options: EnumOption[];
    allowedValues: string[];
}
export interface NoteCriterion extends BaseCriterion {
    type: "note";
}
export type Criterion = NumericCriterion | BooleanCriterion | EnumCriterion | NoteCriterion;
export interface DecisionScenario {
    id: string;
    name: string;
    description: string;
    candidates: Candidate[];
    criteria: Criterion[];
    createdAt: string;
    updatedAt: string;
}
export interface NumericCriterionMeta {
    criterionId: string;
    min: number;
    max: number;
    hasSpread: boolean;
}
export interface CriterionContribution {
    criterionId: string;
    criterionName: string;
    criterionType: CriterionType;
    weight: number;
    rawValue: CandidateValue;
    utility: number;
    normalizedValue: number | null;
    weightedPoints: number;
    displayValue: string;
}
export interface CandidateScore {
    candidate: Candidate;
    totalWeightedPoints: number;
    totalScore: number;
    contributions: CriterionContribution[];
    utilityByCriterionId: Record<string, number>;
    rank: number;
}
export interface ExcludedCandidate {
    candidate: Candidate;
    reasons: string[];
}
export interface DominancePair {
    dominatorId: string;
    dominatedId: string;
}
export interface PairwiseCell {
    rowCandidateId: string;
    columnCandidateId: string;
    delta: number;
    winnerId: string | null;
    dominance: "row" | "column" | null;
}
export interface FrontierPoint {
    candidateId: string;
    candidateName: string;
    xCriterionId: string;
    yCriterionId: string;
    xValue: number;
    yValue: number;
    xUtility: number;
    yUtility: number;
    onFrontier: boolean;
}
export interface AnalysisResult {
    ranking: CandidateScore[];
    excluded: ExcludedCandidate[];
    numericMetaByCriterionId: Record<string, NumericCriterionMeta>;
    totalActiveWeight: number;
    dominancePairs: DominancePair[];
    pairwise: PairwiseCell[];
}
export interface CandidateExplanation {
    title: string;
    summary: string;
    helpedMost: string[];
    hurtMost: string[];
    overtakePlan: string;
    excludedReasons: string[];
}
export {};
