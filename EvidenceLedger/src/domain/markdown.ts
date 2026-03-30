import { formatPoints, formatVerdict } from "./helpers";
import type { AnalysisResult, EvidenceScenario } from "./types";

export function buildMarkdownSummary(
  scenario: EvidenceScenario,
  analysis: AnalysisResult
): string {
  const leadClaim = analysis.summary.leadClaimId
    ? analysis.claimAssessmentById[analysis.summary.leadClaimId]
    : null;
  const topGap = analysis.summary.topGapClaimId
    ? analysis.claimAssessmentById[analysis.summary.topGapClaimId]
    : null;

  return [
    `# ${scenario.name}`,
    "",
    scenario.description,
    "",
    "## Snapshot",
    "",
    `- Claims: ${analysis.summary.claimCount}`,
    `- Sources: ${analysis.summary.sourceCount}`,
    `- Contested claims: ${analysis.summary.contestedCount}`,
    `- Thin or open claims: ${analysis.summary.openCount}`,
    leadClaim
      ? `- Lead claim: ${leadClaim.claim.statement} (${formatVerdict(leadClaim.verdict)})`
      : "- Lead claim: none",
    topGap ? `- Biggest gap: ${topGap.claim.statement}` : "- Biggest gap: none",
    "",
    "## Claims",
    "",
    ...analysis.claimAssessments.flatMap((assessment) => [
      `### ${assessment.claim.statement}`,
      "",
      `- Verdict: ${formatVerdict(assessment.verdict)}`,
      `- Importance: ${assessment.claim.importance} / 5`,
      `- Support: ${formatPoints(assessment.supportScore)}`,
      `- Contradiction: ${formatPoints(assessment.contradictionScore)}`,
      `- Mentions: ${formatPoints(assessment.mentionScore)}`,
      `- Sources: ${assessment.uniqueSourceCount}`,
      "",
    ]),
    "## Gaps",
    "",
    ...(analysis.gapClaims.length > 0
      ? analysis.gapClaims.slice(0, 5).map(
          (assessment) =>
            `- ${assessment.claim.statement}: ${formatVerdict(assessment.verdict)} with coverage ${assessment.coverageScore.toFixed(
              0
            )}/100`
        )
      : ["- No major gaps surfaced."]),
    "",
    "## Contested",
    "",
    ...(analysis.contestedClaims.length > 0
      ? analysis.contestedClaims.slice(0, 5).map(
          (assessment) =>
            `- ${assessment.claim.statement}: ${formatPoints(
              assessment.supportScore
            )} support vs ${formatPoints(assessment.contradictionScore)} contradiction`
        )
      : ["- No heavily contested claims surfaced."]),
    "",
  ].join("\n");
}
