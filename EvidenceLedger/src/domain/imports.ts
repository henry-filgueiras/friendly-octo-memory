import type { LensArtifactEnvelope } from "lens-core";
import { createEmptyScenario, syncScenario } from "./helpers";
import type { EvidenceScenario } from "./types";

function buildClaimSetImportDescription(artifact: LensArtifactEnvelope<"ClaimSet">): string {
  const producedBy = artifact.provenance.producedBy.transformId
    ? `${artifact.provenance.producedBy.app} via ${artifact.provenance.producedBy.transformId}`
    : artifact.provenance.producedBy.app;
  const sourceScenario = artifact.provenance.sourceScenario
    ? ` Origin scenario: ${artifact.provenance.sourceScenario.app}${
        artifact.provenance.sourceScenario.scenarioName
          ? ` / ${artifact.provenance.sourceScenario.scenarioName}`
          : ""
      }.`
    : "";

  return `Seeded from ClaimSet artifact "${artifact.title}" produced by ${producedBy}.${sourceScenario}`.trim();
}

export function isClaimSetArtifactEnvelope(
  value: unknown
): value is LensArtifactEnvelope<"ClaimSet"> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      "payload" in value &&
      (value as { kind?: unknown }).kind === "ClaimSet"
  );
}

export function seedScenarioFromClaimSetArtifact(
  artifact: LensArtifactEnvelope<"ClaimSet">
): EvidenceScenario {
  const base = createEmptyScenario();

  return syncScenario({
    ...base,
    id: `scenario-${artifact.id}`,
    name: `${artifact.payload.subject} evidence ledger`,
    description: buildClaimSetImportDescription(artifact),
    createdAt: artifact.createdAt,
    claims: artifact.payload.claims.map((claim) => ({
      id: claim.id,
      statement: claim.statement,
      category: claim.category ?? "Imported claim",
      importance: 3,
      notes: claim.notes ?? "",
    })),
    sources: [],
    links: [],
  });
}
