import type { LensArtifactEnvelope } from "lens-core";
import type { EvidenceScenario } from "./types";

export function buildEvidenceMapArtifact(
  scenario: EvidenceScenario,
  sourceArtifact?: LensArtifactEnvelope | null
): LensArtifactEnvelope<"EvidenceMap"> {
  return {
    id: `evidence-map:${scenario.id}:${scenario.updatedAt}`,
    kind: "EvidenceMap",
    schemaVersion: 1,
    title: `${scenario.name} evidence map`,
    createdAt: scenario.updatedAt,
    payload: {
      subject: scenario.name,
      claims: scenario.claims.map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        category: claim.category,
        notes: claim.notes,
      })),
      sources: scenario.sources.map((source) => ({
        id: source.id,
        title: source.title,
      })),
      links: scenario.links.map((link) => ({
        id: link.id,
        claimId: link.claimId,
        sourceId: link.sourceId,
        stance: link.stance,
      })),
    },
    provenance: {
      producedBy: {
        app: "EvidenceLedger",
      },
      sourceArtifacts: sourceArtifact
        ? [
            {
              id: sourceArtifact.id,
              kind: sourceArtifact.kind,
              title: sourceArtifact.title,
            },
          ]
        : [],
      sourceScenario: {
        app: "EvidenceLedger",
        scenarioId: scenario.id,
        scenarioName: scenario.name,
      },
    },
  };
}
