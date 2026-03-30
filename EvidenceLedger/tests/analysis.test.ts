import { describe, expect, it } from "vitest";
import { analyzeScenario, calculateEvidencePoints } from "../src/domain/analysis";
import { syncScenario } from "../src/domain/helpers";
import type { EvidenceScenario } from "../src/domain/types";

function createScenario(input: Partial<EvidenceScenario>): EvidenceScenario {
  return syncScenario({
    id: "scenario",
    name: "Test",
    description: "",
    claims: [],
    sources: [],
    links: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...input,
  });
}

describe("calculateEvidencePoints", () => {
  it("multiplies reliability, strength, and confidence deterministically", () => {
    expect(calculateEvidencePoints(80, 50, 50)).toBe(20);
  });
});

describe("analyzeScenario", () => {
  it("classifies strongly supported claims", () => {
    const scenario = createScenario({
      claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
      sources: [{ id: "source", title: "Source", type: "metric", reliability: 90, notes: "" }],
      links: [
        {
          id: "link",
          claimId: "claim",
          sourceId: "source",
          stance: "supports",
          strength: 90,
          confidence: 90,
          excerpt: "",
        },
      ],
    });

    expect(analyzeScenario(scenario).claimAssessments[0]?.verdict).toBe("supported");
  });

  it("classifies contested claims when support and contradiction are both strong", () => {
    const scenario = createScenario({
      claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
      sources: [
        { id: "support", title: "Support", type: "metric", reliability: 90, notes: "" },
        { id: "contra", title: "Contradiction", type: "metric", reliability: 88, notes: "" },
      ],
      links: [
        {
          id: "link-1",
          claimId: "claim",
          sourceId: "support",
          stance: "supports",
          strength: 88,
          confidence: 90,
          excerpt: "",
        },
        {
          id: "link-2",
          claimId: "claim",
          sourceId: "contra",
          stance: "contradicts",
          strength: 86,
          confidence: 88,
          excerpt: "",
        },
      ],
    });

    expect(analyzeScenario(scenario).claimAssessments[0]?.verdict).toBe("contested");
  });

  it("keeps unsupported high-importance claims at the top of the gap list", () => {
    const scenario = createScenario({
      claims: [
        { id: "high", statement: "High", category: "Test", importance: 5, notes: "" },
        { id: "low", statement: "Low", category: "Test", importance: 2, notes: "" },
      ],
      sources: [{ id: "source", title: "Source", type: "metric", reliability: 90, notes: "" }],
      links: [
        {
          id: "link",
          claimId: "low",
          sourceId: "source",
          stance: "supports",
          strength: 75,
          confidence: 80,
          excerpt: "",
        },
      ],
    });

    const analysis = analyzeScenario(scenario);
    expect(analysis.gapClaims[0]?.claim.id).toBe("high");
  });

  it("builds matrix cells with mixed stance when the same source both supports and contradicts a claim", () => {
    const scenario = createScenario({
      claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 4, notes: "" }],
      sources: [{ id: "source", title: "Source", type: "document", reliability: 80, notes: "" }],
      links: [
        {
          id: "support",
          claimId: "claim",
          sourceId: "source",
          stance: "supports",
          strength: 60,
          confidence: 80,
          excerpt: "",
        },
        {
          id: "contra",
          claimId: "claim",
          sourceId: "source",
          stance: "contradicts",
          strength: 65,
          confidence: 78,
          excerpt: "",
        },
      ],
    });

    expect(analyzeScenario(scenario).matrix[0]?.stance).toBe("mixed");
  });

  it("ranks sources by impact score", () => {
    const scenario = createScenario({
      claims: [
        { id: "claim-a", statement: "Claim A", category: "Test", importance: 4, notes: "" },
        { id: "claim-b", statement: "Claim B", category: "Test", importance: 4, notes: "" },
      ],
      sources: [
        { id: "strong", title: "Strong", type: "metric", reliability: 90, notes: "" },
        { id: "weak", title: "Weak", type: "metric", reliability: 60, notes: "" },
      ],
      links: [
        {
          id: "link-a",
          claimId: "claim-a",
          sourceId: "strong",
          stance: "supports",
          strength: 90,
          confidence: 90,
          excerpt: "",
        },
        {
          id: "link-b",
          claimId: "claim-b",
          sourceId: "weak",
          stance: "supports",
          strength: 50,
          confidence: 50,
          excerpt: "",
        },
      ],
    });

    expect(analyzeScenario(scenario).sourceAssessments[0]?.source.id).toBe("strong");
  });
});
