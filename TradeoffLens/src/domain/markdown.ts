import { formatNumber, getEnumOptionLabel } from "./helpers";
import { explainCandidate } from "./explanations";
import type { AnalysisResult, DecisionScenario } from "./types";

export function buildMarkdownSummary(
  scenario: DecisionScenario,
  analysis: AnalysisResult
): string {
  const leader = analysis.ranking[0];
  const explanation = explainCandidate(
    scenario,
    analysis,
    leader ? leader.candidate.id : scenario.candidates[0]?.id ?? null
  );

  const lines: string[] = [
    `# ${scenario.name}`,
    "",
    scenario.description,
    "",
    "## Snapshot",
    "",
    `- Candidates: ${scenario.candidates.length}`,
    `- Eligible candidates: ${analysis.ranking.length}`,
    `- Excluded candidates: ${analysis.excluded.length}`,
    `- Active weighted criteria: ${scenario.criteria.filter((criterion) => criterion.type !== "note" && criterion.weight > 0).length}`,
    `- Current leader: ${leader ? `${leader.candidate.name} (${formatNumber(leader.totalScore)})` : "None"}`,
    "",
    "## Criteria",
    "",
  ];

  scenario.criteria.forEach((criterion) => {
    if (criterion.type === "numeric") {
      lines.push(
        `- ${criterion.name}: numeric, ${criterion.direction}, weight ${criterion.weight}${
          criterion.constraintEnabled
            ? `, hard constraint min=${criterion.minConstraint ?? "-"} max=${criterion.maxConstraint ?? "-"}`
            : ""
        }`
      );
      return;
    }

    if (criterion.type === "boolean") {
      lines.push(
        `- ${criterion.name}: boolean, prefers ${
          criterion.direction === "maximize" ? "true" : "false"
        }, weight ${criterion.weight}${
          criterion.constraintEnabled
            ? `, hard constraint must be ${criterion.requiredValue ? "true" : "false"}`
            : ""
        }`
      );
      return;
    }

    if (criterion.type === "enum") {
      const options = criterion.options
        .map((option) => `${option.label}=${formatNumber(option.score)}`)
        .join(", ");
      lines.push(
        `- ${criterion.name}: enum, weight ${criterion.weight}, options ${options}${
          criterion.constraintEnabled
            ? `, allowed values ${
                criterion.allowedValues
                  .map((value) => getEnumOptionLabel(criterion, value))
                  .join(", ") || "none selected"
              }`
            : ""
        }`
      );
      return;
    }

    lines.push(`- ${criterion.name}: note only, not scored`);
  });

  lines.push("", "## Ranked Candidates", "");

  analysis.ranking.forEach((entry) => {
    const topContributions = [...entry.contributions]
      .sort((left, right) => right.weightedPoints - left.weightedPoints)
      .slice(0, 3)
      .map((item) => `${item.criterionName} (${formatNumber(item.weightedPoints)})`)
      .join(", ");

    lines.push(
      `1. ${entry.candidate.name} - ${formatNumber(entry.totalScore)}. Strongest contributions: ${topContributions || "none"}.`
    );
  });

  if (analysis.excluded.length > 0) {
    lines.push("", "## Excluded Candidates", "");
    analysis.excluded.forEach((entry) => {
      lines.push(`- ${entry.candidate.name}: ${entry.reasons.join(" ")}`);
    });
  }

  lines.push(
    "",
    "## Explanation",
    "",
    `**${explanation.title}**`,
    "",
    explanation.summary,
    "",
    explanation.overtakePlan,
    ""
  );

  return lines.join("\n");
}
