import { clamp } from "./helpers";
import type {
  AnalysisResult,
  ClaimAssessment,
  ClaimVerdict,
  EvidenceGroupAssessment,
  EvidenceLinkAssessment,
  EvidenceScenario,
  MatrixCell,
  SourceAssessment,
} from "./types";

const VERDICT_PRIORITY: Record<ClaimVerdict, number> = {
  contested: 0,
  open: 1,
  thin: 2,
  "leaning-contradicted": 3,
  contradicted: 4,
  "leaning-supported": 5,
  supported: 6,
};

export function calculateEvidencePoints(
  reliability: number,
  strength: number,
  confidence: number
): number {
  return (clamp(reliability, 0, 100) * clamp(strength, 0, 100) * clamp(confidence, 0, 100)) / 10000;
}

function classifyClaim({
  supportScore,
  contradictionScore,
  mentionScore,
  uniqueSourceCount,
}: {
  supportScore: number;
  contradictionScore: number;
  mentionScore: number;
  uniqueSourceCount: number;
}): ClaimVerdict {
  const evidenceScore = supportScore + contradictionScore;
  const netScore = supportScore - contradictionScore;

  if (supportScore >= 25 && contradictionScore >= 25) {
    return "contested";
  }

  if (evidenceScore === 0 && mentionScore < 20) {
    return "open";
  }

  if (evidenceScore < 14 && mentionScore < 12) {
    return "open";
  }

  if (uniqueSourceCount <= 1) {
    return "thin";
  }

  if (supportScore >= 30 && contradictionScore <= 10) {
    return "supported";
  }

  if (contradictionScore >= 30 && supportScore <= 10) {
    return "contradicted";
  }

  if (evidenceScore < 24) {
    return "thin";
  }

  if (netScore >= 12) {
    return "leaning-supported";
  }

  if (netScore <= -12) {
    return "leaning-contradicted";
  }

  return "contested";
}

function compareClaims(left: ClaimAssessment, right: ClaimAssessment): number {
  return (
    right.claim.importance - left.claim.importance ||
    VERDICT_PRIORITY[left.verdict] - VERDICT_PRIORITY[right.verdict] ||
    right.gapScore - left.gapScore ||
    left.claim.statement.localeCompare(right.claim.statement)
  );
}

function compareSources(left: SourceAssessment, right: SourceAssessment): number {
  return (
    right.impactScore - left.impactScore ||
    right.uniqueClaimCount - left.uniqueClaimCount ||
    left.source.title.localeCompare(right.source.title)
  );
}

function buildEvidenceGroups(
  relevantLinks: EvidenceLinkAssessment[]
): EvidenceGroupAssessment[] {
  const groupMap = new Map<string, EvidenceLinkAssessment[]>();

  relevantLinks.forEach((entry) => {
    const key = `${entry.source.id}:${entry.link.stance}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }

    groupMap.get(key)?.push(entry);
  });

  return Array.from(groupMap.values())
    .map((links) => {
      const orderedLinks = [...links].sort(
        (left, right) =>
          right.points - left.points ||
          left.link.id.localeCompare(right.link.id)
      );
      const strongestLink = orderedLinks[0];

      return {
        claim: strongestLink.claim,
        source: strongestLink.source,
        stance: strongestLink.link.stance,
        // Cap same-source same-stance evidence at the strongest excerpt.
        points: strongestLink.points,
        rawPoints: orderedLinks.reduce((sum, entry) => sum + entry.points, 0),
        strongestLink,
        links: orderedLinks,
      } satisfies EvidenceGroupAssessment;
    })
    .sort(
      (left, right) =>
        right.points - left.points || left.source.title.localeCompare(right.source.title)
    );
}

export function analyzeScenario(scenario: EvidenceScenario): AnalysisResult {
  const claims = [...scenario.claims].sort((left, right) =>
    left.statement.localeCompare(right.statement)
  );
  const sources = [...scenario.sources].sort((left, right) => left.title.localeCompare(right.title));

  const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]));
  const claimById = Object.fromEntries(claims.map((claim) => [claim.id, claim]));

  const claimAssessments = claims.map((claim) => {
    const relevantLinks = scenario.links
      .filter((link) => link.claimId === claim.id && sourceById[link.sourceId])
      .map((link) => {
        const source = sourceById[link.sourceId];
        return {
          link,
          source,
          claim,
          points: calculateEvidencePoints(source.reliability, link.strength, link.confidence),
        } satisfies EvidenceLinkAssessment;
      })
      .sort(
        (left, right) =>
          right.points - left.points || left.source.title.localeCompare(right.source.title)
      );

    const supportLinks = relevantLinks.filter((entry) => entry.link.stance === "supports");
    const contradictionLinks = relevantLinks.filter((entry) => entry.link.stance === "contradicts");
    const mentionLinks = relevantLinks.filter((entry) => entry.link.stance === "mentions");
    const supportGroups = buildEvidenceGroups(supportLinks);
    const contradictionGroups = buildEvidenceGroups(contradictionLinks);
    const mentionGroups = buildEvidenceGroups(mentionLinks);
    const supportScore = supportGroups.reduce((sum, entry) => sum + entry.points, 0);
    const contradictionScore = contradictionGroups.reduce((sum, entry) => sum + entry.points, 0);
    const mentionScore = mentionGroups.reduce((sum, entry) => sum + entry.points, 0);
    const evidenceScore = supportScore + contradictionScore;
    const uniqueSourceCount = new Set(relevantLinks.map((entry) => entry.source.id)).size;
    const uniqueSourceTypeCount = new Set(relevantLinks.map((entry) => entry.source.type)).size;
    const coverageScore = clamp(
      evidenceScore * 0.65 +
        mentionScore * 0.2 +
        uniqueSourceCount * 18 +
        uniqueSourceTypeCount * 8,
      0,
      100
    );
    const certaintyScore = clamp(
      evidenceScore * 0.6 + uniqueSourceCount * 22 + uniqueSourceTypeCount * 10,
      0,
      100
    );
    const verdict = classifyClaim({
      supportScore,
      contradictionScore,
      mentionScore,
      uniqueSourceCount,
    });
    const contestedScore = Math.min(supportScore, contradictionScore) * claim.importance;
    const gapScore = clamp((120 - coverageScore) * claim.importance + Math.abs(contradictionScore - supportScore) * 0.2, 0, 999);

    return {
      claim,
      supportScore,
      contradictionScore,
      mentionScore,
      netScore: supportScore - contradictionScore,
      evidenceScore,
      coverageScore,
      certaintyScore,
      gapScore,
      contestedScore,
      verdict,
      uniqueSourceCount,
      uniqueSourceTypeCount,
      supportLinks,
      contradictionLinks,
      mentionLinks,
      supportGroups,
      contradictionGroups,
      mentionGroups,
    } satisfies ClaimAssessment;
  });

  const claimAssessmentById = Object.fromEntries(
    claimAssessments.map((assessment) => [assessment.claim.id, assessment])
  );

  const sourceAssessments = sources
    .map((source) => {
      const relevantLinks = scenario.links
        .filter((link) => link.sourceId === source.id && claimById[link.claimId])
        .map((link) => ({
          link,
          source,
          claim: claimById[link.claimId],
          points: calculateEvidencePoints(source.reliability, link.strength, link.confidence),
        }))
        .sort(
          (left, right) =>
            right.points - left.points || left.claim.statement.localeCompare(right.claim.statement)
        );

      const supportScore = relevantLinks
        .filter((entry) => entry.link.stance === "supports");
      const contradictionScore = relevantLinks
        .filter((entry) => entry.link.stance === "contradicts");
      const mentionScore = relevantLinks
        .filter((entry) => entry.link.stance === "mentions");
      const supportGroups = buildEvidenceGroups(supportScore);
      const contradictionGroups = buildEvidenceGroups(contradictionScore);
      const mentionGroups = buildEvidenceGroups(mentionScore);

      return {
        source,
        supportScore: supportGroups.reduce((sum, entry) => sum + entry.points, 0),
        contradictionScore: contradictionGroups.reduce((sum, entry) => sum + entry.points, 0),
        mentionScore: mentionGroups.reduce((sum, entry) => sum + entry.points, 0),
        impactScore:
          supportGroups.reduce((sum, entry) => sum + entry.points, 0) +
          contradictionGroups.reduce((sum, entry) => sum + entry.points, 0) +
          mentionGroups.reduce((sum, entry) => sum + entry.points, 0) * 0.4,
        uniqueClaimCount: new Set(relevantLinks.map((entry) => entry.claim.id)).size,
        linkCount: relevantLinks.length,
        strongestLinks: relevantLinks.slice(0, 3),
      } satisfies SourceAssessment;
    })
    .sort(compareSources);

  const contestedClaims = claimAssessments
    .filter(
      (assessment) =>
        assessment.verdict === "contested" ||
        (assessment.supportScore >= 18 && assessment.contradictionScore >= 18)
    )
    .sort(
      (left, right) =>
        right.contestedScore - left.contestedScore ||
        right.claim.importance - left.claim.importance ||
        left.claim.statement.localeCompare(right.claim.statement)
    );

  const gapClaims = claimAssessments
    .filter((assessment) => assessment.verdict === "open" || assessment.verdict === "thin")
    .sort(
      (left, right) =>
        right.gapScore - left.gapScore ||
        right.claim.importance - left.claim.importance ||
        left.claim.statement.localeCompare(right.claim.statement)
    );

  const matrix: MatrixCell[] = [];

  sources.forEach((source) => {
    claims.forEach((claim) => {
      const relevantLinks = scenario.links
        .filter((link) => link.sourceId === source.id && link.claimId === claim.id)
        .map((link) => ({
          link,
          score: calculateEvidencePoints(source.reliability, link.strength, link.confidence),
        }))
        .sort((left, right) => right.score - left.score);

      if (relevantLinks.length === 0) {
        matrix.push({
          claimId: claim.id,
          sourceId: source.id,
          label: "",
          stance: null,
          score: 0,
        });
        return;
      }

      const stances = new Set(relevantLinks.map((entry) => entry.link.stance));
      const strongest = relevantLinks[0];

      matrix.push({
        claimId: claim.id,
        sourceId: source.id,
        label: strongest.score.toFixed(0),
        stance: stances.size > 1 ? "mixed" : strongest.link.stance,
        score: strongest.score,
      });
    });
  });

  const orderedClaims = [...claimAssessments].sort(compareClaims);

  return {
    claimAssessments: orderedClaims,
    claimAssessmentById,
    sourceAssessments,
    contestedClaims,
    gapClaims,
    matrix,
    summary: {
      leadClaimId: orderedClaims[0]?.claim.id ?? null,
      topGapClaimId: gapClaims[0]?.claim.id ?? null,
      contestedCount: contestedClaims.length,
      openCount: claimAssessments.filter(
        (assessment) => assessment.verdict === "open" || assessment.verdict === "thin"
      ).length,
      sourceCount: sources.length,
      claimCount: claims.length,
    },
  };
}
