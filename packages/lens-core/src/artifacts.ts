export type LensArtifactKind =
  | "ProblemFrame"
  | "DecisionModel"
  | "RankedOptions"
  | "ExecutionPlan"
  | "ClaimSet"
  | "EvidenceMap"
  | "RecommendationPacket";

export interface ProblemFrameArtifact {
  subject: string;
  summary: string;
  constraints: string[];
  openQuestions: string[];
}

export interface DecisionModelArtifact {
  subject: string;
  criteria: Array<{
    id: string;
    name: string;
    weight?: number;
  }>;
  options: Array<{
    id: string;
    name: string;
    score?: number | null;
    excluded?: boolean;
    excludedReasons?: string[];
  }>;
}

export interface RankedOptionsArtifact {
  subject: string;
  ranked: Array<{
    optionId: string;
    optionName: string;
    rank: number;
    score: number;
  }>;
  excluded: Array<{
    optionId: string;
    optionName: string;
    reasons: string[];
  }>;
}

export interface ExecutionPlanArtifact {
  subject: string;
  deadlineDay?: number | null;
  projectFinishDay: number;
  deadlineMissDays: number;
  tasks: Array<{
    id: string;
    name: string;
    status: "todo" | "active" | "blocked" | "done";
    notes?: string;
    critical: boolean;
    constraintIssues: string[];
  }>;
}

export interface ClaimSetArtifact {
  subject: string;
  claims: Array<{
    id: string;
    statement: string;
    category?: string;
    notes?: string;
  }>;
}

export interface EvidenceMapArtifact {
  subject: string;
  claims: Array<{
    id: string;
    statement: string;
    category?: string;
    notes?: string;
  }>;
  sources: Array<{
    id: string;
    title: string;
  }>;
  links: Array<{
    id: string;
    claimId: string;
    sourceId: string;
    stance: "supports" | "contradicts" | "mentions";
  }>;
}

export interface RecommendationPacketArtifact {
  subject: string;
  summary: string;
  recommendedOptionId?: string;
  supportingArtifactIds: string[];
}

export interface LensArtifactPayloadByKind {
  ProblemFrame: ProblemFrameArtifact;
  DecisionModel: DecisionModelArtifact;
  RankedOptions: RankedOptionsArtifact;
  ExecutionPlan: ExecutionPlanArtifact;
  ClaimSet: ClaimSetArtifact;
  EvidenceMap: EvidenceMapArtifact;
  RecommendationPacket: RecommendationPacketArtifact;
}

export interface LensArtifactReference<TKind extends LensArtifactKind = LensArtifactKind> {
  id: string;
  kind: TKind;
  title: string;
}

export interface LensArtifactProvenance {
  producedBy: {
    app: string;
    transformId?: string;
  };
  sourceArtifacts: LensArtifactReference[];
  sourceScenario?: {
    app: string;
    scenarioId?: string | null;
    scenarioName?: string | null;
  };
}

export interface LensArtifactEnvelope<TKind extends LensArtifactKind = LensArtifactKind> {
  id: string;
  kind: TKind;
  schemaVersion: number;
  title: string;
  createdAt: string;
  payload: LensArtifactPayloadByKind[TKind];
  provenance: LensArtifactProvenance;
}

export interface LensArtifactDefinition<TKind extends LensArtifactKind = LensArtifactKind> {
  kind: TKind;
  label: string;
  description: string;
}

export const lensArtifactRegistry: LensArtifactDefinition[] = [
  {
    kind: "ProblemFrame",
    label: "Problem Frame",
    description: "Stable framing output describing the problem, constraints, and open questions.",
  },
  {
    kind: "DecisionModel",
    label: "Decision Model",
    description: "A decision-analysis snapshot with criteria and option-level scoring metadata.",
  },
  {
    kind: "RankedOptions",
    label: "Ranked Options",
    description: "A stable ranked list projected from a decision-analysis artifact.",
  },
  {
    kind: "ExecutionPlan",
    label: "Execution Plan",
    description: "A stable plan output describing tasks, statuses, and delivery pressure.",
  },
  {
    kind: "ClaimSet",
    label: "Claim Set",
    description: "A list of inspectable claims that can be challenged or evidenced elsewhere.",
  },
  {
    kind: "EvidenceMap",
    label: "Evidence Map",
    description: "A stable evidence artifact containing claims, sources, and links between them.",
  },
  {
    kind: "RecommendationPacket",
    label: "Recommendation Packet",
    description: "A compact recommendation artifact backed by referenced upstream artifacts.",
  },
];

export function getLensArtifactDefinition<TKind extends LensArtifactKind>(
  kind: TKind
): LensArtifactDefinition<TKind> | undefined {
  return lensArtifactRegistry.find((entry) => entry.kind === kind) as
    | LensArtifactDefinition<TKind>
    | undefined;
}
