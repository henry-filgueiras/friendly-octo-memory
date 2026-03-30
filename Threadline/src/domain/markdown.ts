import { formatDay, formatDuration, modeLabel } from "./helpers";
import type { AnalysisResult, ThreadlineScenario } from "./types";

export function buildMarkdownSummary(
  scenario: ThreadlineScenario,
  analysis: AnalysisResult
): string {
  const lines: string[] = [];

  lines.push(`# ${scenario.name}`);
  lines.push("");
  lines.push(scenario.description || "Local-only planning scenario.");
  lines.push("");
  lines.push(`- Mode: ${modeLabel(scenario.mode)}`);
  lines.push(
    `- Finish: ${formatDay(analysis.projectFinishDay)}${
      scenario.deadlineDay !== null ? ` against target ${formatDay(scenario.deadlineDay)}` : ""
    }`
  );
  lines.push(`- Deadline miss: ${formatDuration(analysis.deadlineMissDays)}`);
  lines.push(
    `- Critical path: ${
      analysis.criticalPathIds
        .map((taskId) => analysis.scheduledTaskById[taskId]?.task.name)
        .filter(Boolean)
        .join(" -> ") || "None"
    }`
  );
  lines.push("");
  lines.push("## Plan summary");
  lines.push("");
  lines.push(analysis.planSummary.headline);
  lines.push("");
  lines.push(analysis.planSummary.summary);
  lines.push("");
  lines.push("## Schedule");
  lines.push("");

  analysis.scheduledTasks.forEach((scheduledTask) => {
    lines.push(
      `- ${scheduledTask.task.name}: ${formatDay(scheduledTask.startDay)} to ${formatDay(scheduledTask.endDay)} in ${scheduledTask.lane.name} (${scheduledTask.critical ? "critical" : `${formatDuration(Math.round(scheduledTask.slackDays))} slack`})`
    );
  });

  lines.push("");
  lines.push("## Bottlenecks");
  lines.push("");

  if (analysis.bottlenecks.length === 0) {
    lines.push("- No major bottlenecks detected.");
  } else {
    analysis.bottlenecks.forEach((bottleneck) => {
      lines.push(`- ${bottleneck.title}: ${bottleneck.detail}`);
    });
  }

  lines.push("");
  lines.push("## Risk hotspots");
  lines.push("");

  analysis.riskHotspots.forEach((risk) => {
    const scheduledTask = analysis.scheduledTaskById[risk.taskId];
    lines.push(
      `- ${scheduledTask.task.name}: 1-day slip moves finish by ${formatDuration(risk.delaySlipDays)} and fans out to ${risk.downstreamCount} downstream tasks.`
    );
  });

  return lines.join("\n");
}
