import { formatImportance, formatPoints, formatVerdict } from "./helpers";
import type { AnalysisResult, ClaimExplanation } from "./types";

export function buildClaimExplanation(
  analysis: AnalysisResult,
  claimId: string | null
): ClaimExplanation | null {
  if (!claimId) {
    return null;
  }

  const assessment = analysis.claimAssessmentById[claimId];

  if (!assessment) {
    return null;
  }

  const helps = assessment.supportLinks.slice(0, 3).map((entry) => {
    const excerpt = entry.link.excerpt.trim();
    return `${entry.source.title} adds ${formatPoints(entry.points)} of support${
      excerpt ? `: ${excerpt}` : "."
    }`;
  });
  const hurts = assessment.contradictionLinks.slice(0, 3).map((entry) => {
    const excerpt = entry.link.excerpt.trim();
    return `${entry.source.title} adds ${formatPoints(entry.points)} of contradiction${
      excerpt ? `: ${excerpt}` : "."
    }`;
  });

  const nextEvidence: string[] = [];

  if (assessment.verdict === "open") {
    nextEvidence.push(
      "This claim needs at least one direct supporting or contradicting source before it should drive a decision."
    );
  }

  if (assessment.verdict === "thin") {
    nextEvidence.push(
      "The current case is fragile. Look for a second independent source before treating this as settled."
    );
  }

  if (assessment.verdict === "contested") {
    nextEvidence.push(
      "The signal is split. The fastest way to resolve it is to find a higher-reliability source that speaks directly to the same factual point."
    );
  }

  if (assessment.supportLinks.length === 0) {
    nextEvidence.push("There is no direct supporting evidence attached yet.");
  }

  if (assessment.contradictionLinks.length === 0) {
    nextEvidence.push("There is no direct contradictory evidence attached yet, which may hide unresolved risk.");
  }

  if (nextEvidence.length === 0) {
    nextEvidence.push(
      "The next useful move is not more volume but more diversity: add evidence from a different source type to pressure-test the current picture."
    );
  }

  return {
    title: assessment.claim.statement,
    summary: `${formatVerdict(assessment.verdict)} with ${formatPoints(
      assessment.supportScore
    )} support, ${formatPoints(assessment.contradictionScore)} contradiction, and ${
      assessment.uniqueSourceCount
    } source(s). Importance: ${formatImportance(assessment.claim.importance)}.`,
    helps:
      helps.length > 0
        ? helps
        : ["No direct support is attached yet, so the claim is currently standing on inference alone."],
    hurts:
      hurts.length > 0
        ? hurts
        : ["No direct contradiction is attached yet, so this claim has not been seriously challenged."],
    nextEvidence,
  };
}
