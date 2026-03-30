export type SourceType =
  | "interview"
  | "metric"
  | "document"
  | "log"
  | "ticket"
  | "benchmark"
  | "other";

export type EvidenceStance = "supports" | "contradicts" | "mentions";
export type ClaimVerdict =
  | "supported"
  | "leaning-supported"
  | "contested"
  | "leaning-contradicted"
  | "contradicted"
  | "thin"
  | "open";

export interface Claim {
  id: string;
  statement: string;
  category: string;
  importance: number;
  notes: string;
}

export interface Source {
  id: string;
  title: string;
  type: SourceType;
  reliability: number;
  notes: string;
}

export interface EvidenceLink {
  id: string;
  claimId: string;
  sourceId: string;
  stance: EvidenceStance;
  strength: number;
  confidence: number;
  excerpt: string;
}

export interface EvidenceScenario {
  id: string;
  name: string;
  description: string;
  claims: Claim[];
  sources: Source[];
  links: EvidenceLink[];
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceLinkAssessment {
  link: EvidenceLink;
  source: Source;
  claim: Claim;
  points: number;
}

export interface ClaimAssessment {
  claim: Claim;
  supportScore: number;
  contradictionScore: number;
  mentionScore: number;
  netScore: number;
  evidenceScore: number;
  coverageScore: number;
  certaintyScore: number;
  gapScore: number;
  contestedScore: number;
  verdict: ClaimVerdict;
  uniqueSourceCount: number;
  supportLinks: EvidenceLinkAssessment[];
  contradictionLinks: EvidenceLinkAssessment[];
  mentionLinks: EvidenceLinkAssessment[];
}

export interface SourceAssessment {
  source: Source;
  supportScore: number;
  contradictionScore: number;
  mentionScore: number;
  impactScore: number;
  uniqueClaimCount: number;
  linkCount: number;
  strongestLinks: EvidenceLinkAssessment[];
}

export interface MatrixCell {
  claimId: string;
  sourceId: string;
  label: string;
  stance: EvidenceStance | "mixed" | null;
  score: number;
}

export interface LedgerSummary {
  leadClaimId: string | null;
  topGapClaimId: string | null;
  contestedCount: number;
  openCount: number;
  sourceCount: number;
  claimCount: number;
}

export interface ClaimExplanation {
  title: string;
  summary: string;
  helps: string[];
  hurts: string[];
  nextEvidence: string[];
}

export interface AnalysisResult {
  claimAssessments: ClaimAssessment[];
  claimAssessmentById: Record<string, ClaimAssessment>;
  sourceAssessments: SourceAssessment[];
  contestedClaims: ClaimAssessment[];
  gapClaims: ClaimAssessment[];
  matrix: MatrixCell[];
  summary: LedgerSummary;
}
