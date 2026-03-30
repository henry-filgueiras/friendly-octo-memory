import type {
  LensArtifactEnvelope,
  LensArtifactKind,
  LensArtifactReference,
} from "./artifacts";

export type LensWorkflowRunStatus =
  | "idle"
  | "waiting"
  | "running"
  | "needs_human_review"
  | "completed"
  | "failed";

export interface LensWorkflowGuardAllArtifactsPresent {
  type: "all_artifacts_present";
  artifactKinds: LensArtifactKind[];
}

export interface LensWorkflowGuardAnyArtifactPresent {
  type: "any_artifact_present";
  artifactKinds: LensArtifactKind[];
}

export interface LensWorkflowGuardHumanDecisionRecorded {
  type: "human_decision_recorded";
  decisionKey: string;
  acceptedValues?: string[];
}

export type LensWorkflowGuard =
  | LensWorkflowGuardAllArtifactsPresent
  | LensWorkflowGuardAnyArtifactPresent
  | LensWorkflowGuardHumanDecisionRecorded;

export interface LensWorkflowReviewPoint {
  id: string;
  label: string;
  requiredForStepIds: string[];
  description?: string;
}

export interface LensWorkflowStep {
  id: string;
  transformId: string;
  inputKinds: LensArtifactKind[];
  outputKind: LensArtifactKind;
  guards?: LensWorkflowGuard[];
  reviewPointId?: string;
}

export interface LensWorkflowSpec {
  id: string;
  label: string;
  description?: string;
  allowedArtifactKinds: LensArtifactKind[];
  steps: LensWorkflowStep[];
  reviewPoints?: LensWorkflowReviewPoint[];
  terminalArtifactKinds: LensArtifactKind[];
}

export interface LensHumanDecision {
  key: string;
  value: string;
  recordedAt: string;
  actor?: string;
  notes?: string;
}

export interface LensArtifactRegisteredEvent {
  type: "ArtifactRegistered";
  at: string;
  artifact: LensArtifactEnvelope;
}

export interface LensTransformRequestedEvent {
  type: "TransformRequested";
  at: string;
  requestId: string;
  workflowId: string;
  runId: string;
  branchId: string;
  stepId: string;
  transformId: string;
  inputArtifacts: LensArtifactReference[];
}

export interface LensTransformStartedEvent {
  type: "TransformStarted";
  at: string;
  requestId: string;
  workflowId: string;
  runId: string;
  branchId: string;
  stepId: string;
  transformId: string;
}

export interface LensTransformCompletedEvent {
  type: "TransformCompleted";
  at: string;
  requestId: string;
  workflowId: string;
  runId: string;
  branchId: string;
  stepId: string;
  transformId: string;
  outputArtifact: LensArtifactReference;
}

export interface LensTransformFailedEvent {
  type: "TransformFailed";
  at: string;
  requestId: string;
  workflowId: string;
  runId: string;
  branchId: string;
  stepId: string;
  transformId: string;
  error: {
    code: string;
    message: string;
  };
}

export interface LensHumanDecisionRecordedEvent {
  type: "HumanDecisionRecorded";
  at: string;
  workflowId: string;
  runId: string;
  branchId: string;
  reviewPointId?: string;
  decision: LensHumanDecision;
}

export interface LensWorkflowBranchedEvent {
  type: "WorkflowBranched";
  at: string;
  workflowId: string;
  runId: string;
  fromBranchId: string;
  newBranchId: string;
  reason: string;
}

export interface LensWorkflowMergedEvent {
  type: "WorkflowMerged";
  at: string;
  workflowId: string;
  runId: string;
  sourceBranchIds: string[];
  targetBranchId: string;
  decision?: LensHumanDecision;
}

export interface LensArtifactSupersededEvent {
  type: "ArtifactSuperseded";
  at: string;
  artifactId: string;
  supersededByArtifactId: string;
  reason?: string;
}

export interface LensSchemaBridgeAppliedEvent {
  type: "SchemaBridgeApplied";
  at: string;
  artifactId: string;
  fromSchemaVersion: number;
  toSchemaVersion: number;
  bridgeId: string;
}

export type LensWorkflowEvent =
  | LensArtifactRegisteredEvent
  | LensTransformRequestedEvent
  | LensTransformStartedEvent
  | LensTransformCompletedEvent
  | LensTransformFailedEvent
  | LensHumanDecisionRecordedEvent
  | LensWorkflowBranchedEvent
  | LensWorkflowMergedEvent
  | LensArtifactSupersededEvent
  | LensSchemaBridgeAppliedEvent;

export interface LensWorkflowReadyStep {
  branchId: string;
  stepId: string;
  transformId: string;
  inputArtifacts: LensArtifactReference[];
  blockedBy?: string[];
}

export interface LensWorkflowBranchSummary {
  branchId: string;
  parentBranchId?: string;
  createdAt: string;
  mergedAt?: string;
  status: "active" | "merged" | "abandoned";
}

export interface LensWorkflowRunProjection {
  workflowId: string;
  runId: string;
  status: LensWorkflowRunStatus;
  currentArtifacts: LensArtifactReference[];
  readyTransformFrontier: LensWorkflowReadyStep[];
  provenanceEdges: Array<{
    fromArtifactId?: string;
    fromBranchId?: string;
    transformId?: string;
    toArtifactId?: string;
    toBranchId?: string;
  }>;
  branchHistory: LensWorkflowBranchSummary[];
}
