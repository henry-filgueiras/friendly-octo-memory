import { formatDay, formatDuration } from "./helpers";
import type { AnalysisResult, ScheduledTask, TaskExplanation } from "./types";

function summarizeConstraintIssues(task: ScheduledTask): string[] {
  return task.constraintIssues.length > 0 ? task.constraintIssues : [];
}

export function buildTaskExplanation(
  analysis: AnalysisResult,
  taskId: string | null
): TaskExplanation | null {
  if (!taskId) {
    return null;
  }

  const scheduledTask = analysis.scheduledTaskById[taskId];

  if (!scheduledTask) {
    return null;
  }

  const delayImpact = analysis.delayImpacts[taskId];
  const riskSignals: string[] = [];
  const leverageMoves: string[] = [];

  if (scheduledTask.critical) {
    riskSignals.push("It sits on the current critical path, so it has effectively no slack.");
  } else {
    riskSignals.push(
      `It currently has about ${formatDuration(Math.round(scheduledTask.slackDays))} of slack before it threatens the finish.`
    );
  }

  if (scheduledTask.resourceDelayDays > 0) {
    riskSignals.push(
      `Lane capacity is already slowing it down by ${formatDuration(scheduledTask.resourceDelayDays)}.`
    );
  }

  if (scheduledTask.downstreamTaskIds.length > 0) {
    riskSignals.push(
      `${scheduledTask.downstreamTaskIds.length} downstream tasks depend on it directly or indirectly.`
    );
  } else {
    riskSignals.push("It has no downstream dependencies, so it is comparatively easy to move or defer.");
  }

  summarizeConstraintIssues(scheduledTask).forEach((issue) => riskSignals.push(issue));

  if (scheduledTask.resourceDelayDays > 0) {
    leverageMoves.push(
      `Freeing capacity in ${scheduledTask.lane.name} would let this start closer to ${formatDay(scheduledTask.dependencyReadyDay)}.`
    );
  }

  if (scheduledTask.task.deferrable && !scheduledTask.critical) {
    leverageMoves.push("This is a viable defer candidate if the team needs breathing room.");
  }

  if (scheduledTask.task.status !== "done" && scheduledTask.task.confidence < 70) {
    leverageMoves.push("Refining the estimate or breaking it into smaller chunks would reduce uncertainty.");
  }

  if (delayImpact && delayImpact.slipDays > 0) {
    leverageMoves.push(
      `Shortening this task by one day would likely pull the finish in by ${formatDuration(delayImpact.slipDays)}.`
    );
  }

  const summary = scheduledTask.critical
    ? `${scheduledTask.task.name} currently helps set the ship date. It runs from ${formatDay(scheduledTask.startDay)} to ${formatDay(scheduledTask.endDay)} in ${scheduledTask.lane.name}.`
    : `${scheduledTask.task.name} is scheduled for ${formatDay(scheduledTask.startDay)} to ${formatDay(scheduledTask.endDay)} and is not the immediate finish-line driver.`;

  const slipImpact =
    delayImpact && delayImpact.impactedTaskIds.length > 0
      ? `A one-day slip here moves ${delayImpact.impactedTaskIds.length} scheduled tasks and pushes the overall finish by ${formatDuration(delayImpact.slipDays)}.`
      : "A one-day slip here does not currently move the overall finish.";

  return {
    title: scheduledTask.task.name,
    summary,
    riskSignals,
    leverageMoves:
      leverageMoves.length > 0 ? leverageMoves : ["No obvious leverage move stands out beyond general scope reduction."],
    slipImpact,
  };
}
