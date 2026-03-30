import type { AnalysisResult, Criterion, DecisionScenario, Direction, DominancePair, FrontierPoint } from "./types";
export declare function isScoredCriterion(criterion: Criterion): boolean;
export declare function normalizeNumericValue(value: number, min: number, max: number, direction: Direction): number;
export declare function analyzeScenario(scenario: DecisionScenario, weightOverrides?: Record<string, number>): AnalysisResult;
export declare function getDominatedIds(dominancePairs: DominancePair[], dominatorId: string): string[];
export declare function getDominators(dominancePairs: DominancePair[], candidateId: string): string[];
export declare function computeParetoFrontier(scenario: DecisionScenario, analysis: AnalysisResult, xCriterionId: string, yCriterionId: string): FrontierPoint[];
