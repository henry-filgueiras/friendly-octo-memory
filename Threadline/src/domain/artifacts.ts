import type { LensArtifactEnvelope } from "lens-core";
import type { AnalysisResult, ThreadlineScenario } from "./types";

export function buildExecutionPlanArtifact(
  scenario: ThreadlineScenario,
  analysis: AnalysisResult
): LensArtifactEnvelope<"ExecutionPlan"> {
  return {
    id: `execution-plan:${scenario.id}:${scenario.updatedAt}`,
    kind: "ExecutionPlan",
    schemaVersion: 1,
    title: `${scenario.name} execution plan`,
    createdAt: scenario.updatedAt,
    payload: {
      subject: scenario.name,
      deadlineDay: scenario.deadlineDay,
      projectFinishDay: analysis.projectFinishDay,
      deadlineMissDays: analysis.deadlineMissDays,
      tasks: analysis.scheduledTasks.map((scheduledTask) => ({
        id: scheduledTask.task.id,
        name: scheduledTask.task.name,
        status: scheduledTask.task.status,
        notes: scheduledTask.task.notes,
        critical: scheduledTask.critical,
        constraintIssues: [...scheduledTask.constraintIssues],
      })),
    },
    provenance: {
      producedBy: {
        app: "Threadline",
      },
      sourceArtifacts: [],
      sourceScenario: {
        app: "Threadline",
        scenarioId: scenario.id,
        scenarioName: scenario.name,
      },
    },
  };
}
