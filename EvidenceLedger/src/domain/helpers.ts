import type {
  Claim,
  ClaimVerdict,
  EvidenceLink,
  EvidenceScenario,
  Source,
  SourceType,
} from "./types";

const SOURCE_TYPES: SourceType[] = [
  "interview",
  "metric",
  "document",
  "log",
  "ticket",
  "benchmark",
  "other",
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatPoints(points: number): string {
  return `${points.toFixed(points >= 10 ? 0 : 1)} pts`;
}

export function formatVerdict(verdict: ClaimVerdict): string {
  return verdict
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatImportance(value: number): string {
  return `${clamp(Math.round(value), 1, 5)} / 5`;
}

export function formatSourceType(type: SourceType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function createClaim(): Claim {
  return {
    id: createId("claim"),
    statement: "New claim",
    category: "Open question",
    importance: 3,
    notes: "",
  };
}

export function createSource(): Source {
  return {
    id: createId("source"),
    title: "New source",
    type: "document",
    reliability: 70,
    notes: "",
  };
}

export function createLink(claimId: string, sourceId: string): EvidenceLink {
  return {
    id: createId("link"),
    claimId,
    sourceId,
    stance: "supports",
    strength: 60,
    confidence: 70,
    excerpt: "",
  };
}

export function duplicateClaim(claim: Claim): Claim {
  return {
    ...claim,
    id: createId("claim"),
    statement: `${claim.statement} copy`,
  };
}

export function createEmptyScenario(): EvidenceScenario {
  const now = new Date().toISOString();

  return {
    id: createId("scenario"),
    name: "Untitled ledger",
    description: "Map claims to evidence, contradictions, and what is still missing.",
    claims: [],
    sources: [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
}

function syncClaim(claim: Claim, index: number): Claim {
  return {
    id: claim.id || createId("claim"),
    statement: claim.statement?.trim() || `Claim ${index + 1}`,
    category: claim.category?.trim() || "Open question",
    importance: clamp(Math.round(claim.importance ?? 3), 1, 5),
    notes: claim.notes ?? "",
  };
}

function syncSource(source: Source, index: number): Source {
  const type = SOURCE_TYPES.includes(source.type) ? source.type : "other";

  return {
    id: source.id || createId("source"),
    title: source.title?.trim() || `Source ${index + 1}`,
    type,
    reliability: clamp(Math.round(source.reliability ?? 70), 0, 100),
    notes: source.notes ?? "",
  };
}

function syncLink(link: EvidenceLink): EvidenceLink {
  return {
    id: link.id || createId("link"),
    claimId: link.claimId,
    sourceId: link.sourceId,
    stance:
      link.stance === "supports" || link.stance === "contradicts" || link.stance === "mentions"
        ? link.stance
        : "supports",
    strength: clamp(Math.round(link.strength ?? 60), 0, 100),
    confidence: clamp(Math.round(link.confidence ?? 70), 0, 100),
    excerpt: link.excerpt ?? "",
  };
}

export function syncScenario(input: EvidenceScenario): EvidenceScenario {
  const claims = (input.claims ?? []).map(syncClaim);
  const sources = (input.sources ?? []).map(syncSource);
  const validClaimIds = new Set(claims.map((claim) => claim.id));
  const validSourceIds = new Set(sources.map((source) => source.id));
  const links = (input.links ?? [])
    .map(syncLink)
    .filter((link) => validClaimIds.has(link.claimId) && validSourceIds.has(link.sourceId));

  return {
    id: input.id || createId("scenario"),
    name: input.name?.trim() || "Untitled ledger",
    description: input.description ?? "",
    claims,
    sources,
    links,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
