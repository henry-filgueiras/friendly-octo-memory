import type { LensArtifactEnvelope } from "lens-core";
import type { AnalysisResult, DecisionScenario } from "./types";

export function buildDecisionModelArtifact(
  scenario: DecisionScenario,
  analysis: AnalysisResult,
  weightOverrides: Record<string, number> = {}
): LensArtifactEnvelope<"DecisionModel"> {
  const rankedById = new Map(
    analysis.ranking.map((entry) => [entry.candidate.id, entry] as const)
  );
  const excludedById = new Map(
    analysis.excluded.map((entry) => [entry.candidate.id, entry] as const)
  );

  return {
    id: `decision-model:${scenario.id}:${scenario.updatedAt}`,
    kind: "DecisionModel",
    schemaVersion: 1,
    title: `${scenario.name} decision model`,
    createdAt: scenario.updatedAt,
    payload: {
      subject: scenario.name,
      criteria: scenario.criteria
        .filter((criterion) => criterion.type !== "note")
        .map((criterion) => ({
          id: criterion.id,
          name: criterion.name,
          weight: weightOverrides[criterion.id] ?? criterion.weight,
        })),
      options: scenario.candidates.map((candidate) => {
        const ranked = rankedById.get(candidate.id);
        const excluded = excludedById.get(candidate.id);

        return {
          id: candidate.id,
          name: candidate.name,
          score: ranked?.totalScore ?? null,
          excluded: Boolean(excluded),
          excludedReasons: excluded?.reasons ?? [],
        };
      }),
    },
    provenance: {
      producedBy: {
        app: "TradeoffLens",
      },
      sourceArtifacts: [],
      sourceScenario: {
        app: "TradeoffLens",
        scenarioId: scenario.id,
        scenarioName: scenario.name,
      },
    },
  };
}

export function buildRankedOptionsArtifact(
  scenario: DecisionScenario,
  analysis: AnalysisResult
): LensArtifactEnvelope<"RankedOptions"> {
  return {
    id: `ranked-options:${scenario.id}:${scenario.updatedAt}`,
    kind: "RankedOptions",
    schemaVersion: 1,
    title: `${scenario.name} ranked options`,
    createdAt: scenario.updatedAt,
    payload: {
      subject: scenario.name,
      ranked: analysis.ranking.map((entry) => ({
        optionId: entry.candidate.id,
        optionName: entry.candidate.name,
        rank: entry.rank,
        score: entry.totalScore,
      })),
      excluded: analysis.excluded.map((entry) => ({
        optionId: entry.candidate.id,
        optionName: entry.candidate.name,
        reasons: entry.reasons,
      })),
    },
    provenance: {
      producedBy: {
        app: "TradeoffLens",
      },
      sourceArtifacts: [],
      sourceScenario: {
        app: "TradeoffLens",
        scenarioId: scenario.id,
        scenarioName: scenario.name,
      },
    },
  };
}
