import { formatImportance, formatPoints, formatVerdict } from "./helpers";
import type { AnalysisResult, ClaimExplanation } from "./types";

function describeGroup(
  label: "support" | "contradiction",
  sourceTitle: string,
  points: number,
  excerpt: string,
  extraExcerptCount: number
): string {
  const excerptSuffix = excerpt ? `: ${excerpt}` : ".";
  const extraSuffix =
    extraExcerptCount > 0
      ? ` (${extraExcerptCount} more excerpt${extraExcerptCount === 1 ? "" : "s"} from the same source not double-counted)`
      : "";

  return `${sourceTitle} adds ${formatPoints(points)} of ${label}${excerptSuffix}${extraSuffix}`;
}

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

  const helps = assessment.supportGroups.slice(0, 3).map((group) =>
    describeGroup(
      "support",
      group.source.title,
      group.points,
      group.strongestLink.link.excerpt.trim(),
      group.links.length - 1
    )
  );
  const hurts = assessment.contradictionGroups.slice(0, 3).map((group) =>
    describeGroup(
      "contradiction",
      group.source.title,
      group.points,
      group.strongestLink.link.excerpt.trim(),
      group.links.length - 1
    )
  );

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
