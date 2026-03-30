import { describe, expect, it } from "vitest";
import { buildEvidenceMapArtifact } from "../src/domain/artifacts";
import { syncScenario } from "../src/domain/helpers";
import type { EvidenceScenario } from "../src/domain/types";

function createScenario(): EvidenceScenario {
  return syncScenario({
    id: "scenario-evidence-artifact",
    name: "Incident ledger",
    description: "Artifact export coverage.",
    claims: [
      { id: "claim-1", statement: "Retry storm amplified the failure.", category: "Amplifier", importance: 4, notes: "" },
    ],
    sources: [
      { id: "source-1", title: "APM chart", type: "metric", reliability: 90, notes: "" },
    ],
    links: [
      {
        id: "link-1",
        claimId: "claim-1",
        sourceId: "source-1",
        stance: "supports",
        strength: 88,
        confidence: 90,
        excerpt: "",
      },
    ],
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
  });
}

describe("buildEvidenceMapArtifact", () => {
  it("exports an evidence map artifact and carries source artifact provenance", () => {
    const scenario = createScenario();
    const artifact = buildEvidenceMapArtifact(scenario, {
      id: "artifact-claims",
      kind: "ClaimSet",
      schemaVersion: 1,
      title: "Imported claim set",
      createdAt: "2026-03-30T00:00:00.000Z",
      payload: {
        subject: "Imported claim set",
        claims: [],
      },
      provenance: {
        producedBy: { app: "lens-core", transformId: "execution-plan-to-claim-set" },
        sourceArtifacts: [],
        sourceScenario: { app: "Threadline", scenarioId: "scenario-plan" },
      },
    });

    expect(artifact.kind).toBe("EvidenceMap");
    expect(artifact.payload.claims).toHaveLength(1);
    expect(artifact.payload.sources).toHaveLength(1);
    expect(artifact.payload.links).toHaveLength(1);
    expect(artifact.provenance.sourceArtifacts[0]?.id).toBe("artifact-claims");
  });
});
