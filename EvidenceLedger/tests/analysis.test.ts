import { describe, expect, it } from "vitest";
import { analyzeScenario, calculateEvidencePoints } from "../src/domain/analysis";
import { buildClaimExplanation } from "../src/domain/explanations";
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
      sources: [
        { id: "source-1", title: "Source 1", type: "metric", reliability: 90, notes: "" },
        { id: "source-2", title: "Source 2", type: "document", reliability: 88, notes: "" },
      ],
      links: [
        {
          id: "link-1",
          claimId: "claim",
          sourceId: "source-1",
          stance: "supports",
          strength: 90,
          confidence: 90,
          excerpt: "",
        },
        {
          id: "link-2",
          claimId: "claim",
          sourceId: "source-2",
          stance: "supports",
          strength: 86,
          confidence: 88,
          excerpt: "",
        },
      ],
    });

    expect(analyzeScenario(scenario).claimAssessments[0]?.verdict).toBe("supported");
  });

  it("does not let multiple support links from one source inflate a claim like multiple independent sources", () => {
    const sameSourceScenario = createScenario({
      claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
      sources: [{ id: "source", title: "One source", type: "document", reliability: 90, notes: "" }],
      links: [
        {
          id: "link-1",
          claimId: "claim",
          sourceId: "source",
          stance: "supports",
          strength: 90,
          confidence: 90,
          excerpt: "First excerpt",
        },
        {
          id: "link-2",
          claimId: "claim",
          sourceId: "source",
          stance: "supports",
          strength: 85,
          confidence: 88,
          excerpt: "Second excerpt",
        },
      ],
    });
    const independentScenario = createScenario({
      claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
      sources: [
        { id: "source-a", title: "Source A", type: "document", reliability: 90, notes: "" },
        { id: "source-b", title: "Source B", type: "metric", reliability: 88, notes: "" },
      ],
      links: [
        {
          id: "link-a",
          claimId: "claim",
          sourceId: "source-a",
          stance: "supports",
          strength: 90,
          confidence: 90,
          excerpt: "A",
        },
        {
          id: "link-b",
          claimId: "claim",
          sourceId: "source-b",
          stance: "supports",
          strength: 85,
          confidence: 88,
          excerpt: "B",
        },
      ],
    });

    const sameSourceAnalysis = analyzeScenario(sameSourceScenario).claimAssessments[0];
    const independentAnalysis = analyzeScenario(independentScenario).claimAssessments[0];

    expect(sameSourceAnalysis?.supportScore).toBe(calculateEvidencePoints(90, 90, 90));
    expect(independentAnalysis?.supportScore).toBeGreaterThan(sameSourceAnalysis?.supportScore ?? 0);
    expect(sameSourceAnalysis?.uniqueSourceCount).toBe(1);
    expect(independentAnalysis?.uniqueSourceCount).toBe(2);
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

    const analysis = analyzeScenario(scenario);
    const explanation = buildClaimExplanation(analysis, "claim");

    expect(analysis.matrix[0]?.stance).toBe("mixed");
    expect(explanation?.helps.some((entry) => entry.includes("Source"))).toBe(true);
    expect(explanation?.hurts.some((entry) => entry.includes("Source"))).toBe(true);
  });

  it("keeps verdicts sensible across supported, contradicted, contested, thin, and open cases", () => {
    const supported = analyzeScenario(
      createScenario({
        claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
        sources: [
          { id: "s1", title: "S1", type: "metric", reliability: 92, notes: "" },
          { id: "s2", title: "S2", type: "document", reliability: 88, notes: "" },
        ],
        links: [
          { id: "a", claimId: "claim", sourceId: "s1", stance: "supports", strength: 90, confidence: 92, excerpt: "" },
          { id: "b", claimId: "claim", sourceId: "s2", stance: "supports", strength: 84, confidence: 90, excerpt: "" },
        ],
      })
    );
    const contradicted = analyzeScenario(
      createScenario({
        claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
        sources: [
          { id: "s1", title: "S1", type: "metric", reliability: 92, notes: "" },
          { id: "s2", title: "S2", type: "document", reliability: 88, notes: "" },
        ],
        links: [
          { id: "a", claimId: "claim", sourceId: "s1", stance: "contradicts", strength: 90, confidence: 92, excerpt: "" },
          { id: "b", claimId: "claim", sourceId: "s2", stance: "contradicts", strength: 84, confidence: 90, excerpt: "" },
        ],
      })
    );
    const contested = analyzeScenario(
      createScenario({
        claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 5, notes: "" }],
        sources: [
          { id: "s1", title: "S1", type: "metric", reliability: 90, notes: "" },
          { id: "s2", title: "S2", type: "document", reliability: 90, notes: "" },
        ],
        links: [
          { id: "a", claimId: "claim", sourceId: "s1", stance: "supports", strength: 88, confidence: 90, excerpt: "" },
          { id: "b", claimId: "claim", sourceId: "s2", stance: "contradicts", strength: 88, confidence: 90, excerpt: "" },
        ],
      })
    );
    const thin = analyzeScenario(
      createScenario({
        claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 4, notes: "" }],
        sources: [{ id: "s1", title: "S1", type: "metric", reliability: 88, notes: "" }],
        links: [
          { id: "a", claimId: "claim", sourceId: "s1", stance: "supports", strength: 70, confidence: 72, excerpt: "" },
        ],
      })
    );
    const open = analyzeScenario(
      createScenario({
        claims: [{ id: "claim", statement: "Claim", category: "Test", importance: 4, notes: "" }],
        sources: [{ id: "s1", title: "S1", type: "document", reliability: 70, notes: "" }],
        links: [
          { id: "a", claimId: "claim", sourceId: "s1", stance: "mentions", strength: 40, confidence: 50, excerpt: "" },
        ],
      })
    );

    expect(supported.claimAssessments[0]?.verdict).toBe("supported");
    expect(contradicted.claimAssessments[0]?.verdict).toBe("contradicted");
    expect(contested.claimAssessments[0]?.verdict).toBe("contested");
    expect(thin.claimAssessments[0]?.verdict).toBe("thin");
    expect(open.claimAssessments[0]?.verdict).toBe("open");
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
