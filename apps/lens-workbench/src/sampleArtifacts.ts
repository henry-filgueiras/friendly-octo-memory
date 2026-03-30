import type { LensArtifactEnvelope, LensArtifactKind } from "lens-core";

export type WorkbenchArtifact = {
  [K in LensArtifactKind]: LensArtifactEnvelope<K>;
}[LensArtifactKind];

export const SAMPLE_EXECUTION_PLAN_ARTIFACT: LensArtifactEnvelope<"ExecutionPlan"> = {
  id: "artifact-threadline-launch-plan",
  kind: "ExecutionPlan",
  schemaVersion: 1,
  title: "Launch a private beta execution plan",
  createdAt: "2026-03-30T00:00:00.000Z",
  payload: {
    subject: "Launch a private beta",
    deadlineDay: 22,
    projectFinishDay: 20,
    deadlineMissDays: 0,
    tasks: [
      {
        id: "billing",
        name: "Build billing guardrails",
        status: "todo",
        notes: "Prevent accidental paid-plan flows during beta.",
        critical: true,
        constraintIssues: [],
      },
      {
        id: "qa",
        name: "Run beta dry run",
        status: "todo",
        notes: "Walk the signup, invite, and support handoff path end-to-end.",
        critical: true,
        constraintIssues: [
          "Run beta dry run needs to finish by day 18 but currently lands on day 19.",
        ],
      },
      {
        id: "copy",
        name: "Write launch copy",
        status: "todo",
        notes: "Landing page headline, invite email, beta FAQ.",
        critical: false,
        constraintIssues: [],
      },
      {
        id: "scope",
        name: "Lock beta scope",
        status: "done",
        notes: "Decide what is in and out before downstream teams sprint.",
        critical: true,
        constraintIssues: [],
      },
    ],
  },
  provenance: {
    producedBy: {
      app: "Threadline",
    },
    sourceArtifacts: [],
    sourceScenario: {
      app: "Threadline",
      scenarioId: "demo-launch",
      scenarioName: "Launch a private beta",
    },
  },
};

export const SAMPLE_CLAIM_SET_ARTIFACT: LensArtifactEnvelope<"ClaimSet"> = {
  id: "artifact-launch-pressure-claims",
  kind: "ClaimSet",
  schemaVersion: 1,
  title: "Launch pressure claims",
  createdAt: "2026-03-30T00:10:00.000Z",
  payload: {
    subject: "Launch a private beta",
    claims: [
      {
        id: "claim-billing",
        statement: "Build billing guardrails is schedule-critical for delivering Launch a private beta.",
        category: "Critical path",
        notes: "Prevent accidental paid-plan flows during beta.",
      },
      {
        id: "claim-qa",
        statement:
          "Run beta dry run is a schedule-critical task with explicit deadline pressure in the current plan for Launch a private beta.",
        category: "Critical deadline pressure",
        notes: "Walk the signup, invite, and support handoff path end-to-end.",
      },
    ],
  },
  provenance: {
    producedBy: {
      app: "lens-workbench",
      transformId: "execution-plan-to-claim-set",
    },
    sourceArtifacts: [
      {
        id: SAMPLE_EXECUTION_PLAN_ARTIFACT.id,
        kind: SAMPLE_EXECUTION_PLAN_ARTIFACT.kind,
        title: SAMPLE_EXECUTION_PLAN_ARTIFACT.title,
      },
    ],
    sourceScenario: {
      app: "Threadline",
      scenarioId: "demo-launch",
      scenarioName: "Launch a private beta",
    },
  },
};
