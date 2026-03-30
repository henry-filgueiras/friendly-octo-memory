import { describe, expect, it } from "vitest";
import { analyzeScenario, getTaskDuration } from "../src/domain/planning";
import { syncScenario } from "../src/domain/helpers";
import type { ThreadlineScenario } from "../src/domain/types";

function createScenario(): ThreadlineScenario {
  return syncScenario({
    id: "scenario-test",
    name: "Capacity test",
    description: "Tests deterministic scheduling behavior.",
    deadlineDay: 12,
    mode: "expected",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    lanes: [{ id: "eng", name: "Engineering", parallelism: 1, color: "#5cc6c0" }],
    tasks: [
      {
        id: "a",
        name: "A",
        notes: "",
        laneId: "eng",
        owner: "",
        status: "todo",
        estimateDays: 3,
        confidence: 80,
        dependencies: [],
        earliestStartDay: null,
        mustFinishByDay: null,
        deferrable: false,
      },
      {
        id: "b",
        name: "B",
        notes: "",
        laneId: "eng",
        owner: "",
        status: "todo",
        estimateDays: 2,
        confidence: 80,
        dependencies: [],
        earliestStartDay: null,
        mustFinishByDay: null,
        deferrable: true,
      },
      {
        id: "c",
        name: "C",
        notes: "",
        laneId: "eng",
        owner: "",
        status: "todo",
        estimateDays: 4,
        confidence: 80,
        dependencies: ["a"],
        earliestStartDay: null,
        mustFinishByDay: null,
        deferrable: false,
      },
    ],
  });
}

describe("getTaskDuration", () => {
  it("widens duration across scenario modes based on confidence", () => {
    const task = createScenario().tasks[0];
    const optimistic = getTaskDuration({ ...task, estimateDays: 10, confidence: 40 }, "optimistic");
    const expected = getTaskDuration({ ...task, estimateDays: 10, confidence: 40 }, "expected");
    const conservative = getTaskDuration({ ...task, estimateDays: 10, confidence: 40 }, "conservative");

    expect(optimistic).toBeLessThan(expected);
    expect(conservative).toBeGreaterThan(expected);
  });
});

describe("analyzeScenario", () => {
  it("schedules tasks deterministically with dependencies and lane capacity", () => {
    const analysis = analyzeScenario(createScenario());

    expect(analysis.scheduledTaskById.a.startDay).toBe(0);
    expect(analysis.scheduledTaskById.a.endDay).toBe(3);
    expect(analysis.scheduledTaskById.b.startDay).toBe(3);
    expect(analysis.scheduledTaskById.c.startDay).toBe(5);
    expect(analysis.scheduledTaskById.c.resourceDelayDays).toBe(2);
  });

  it("marks the resource-constrained chain as critical", () => {
    const analysis = analyzeScenario(createScenario());

    expect(analysis.criticalPathIds).toEqual(["a", "b", "c"]);
    expect(analysis.projectFinishDay).toBe(9);
  });

  it("reports deadline misses on task-level constraints", () => {
    const scenario = createScenario();
    scenario.tasks = scenario.tasks.map((task) =>
      task.id === "c" ? { ...task, mustFinishByDay: 7 } : task
    );

    const analysis = analyzeScenario(scenario);

    expect(analysis.bottlenecks.some((entry) => entry.kind === "deadline")).toBe(true);
    expect(analysis.scheduledTaskById.c.constraintIssues[0]).toContain("needs to finish by");
  });

  it("recomputes slip impact for downstream tasks", () => {
    const analysis = analyzeScenario(createScenario());

    expect(analysis.delayImpacts.a.slipDays).toBe(1);
    expect(analysis.delayImpacts.a.impactedTaskIds).toContain("c");
  });

  it("summarizes optimistic, expected, and conservative finishes", () => {
    const analysis = analyzeScenario(createScenario());
    const optimistic = analysis.scenarioSummaries.find((summary) => summary.mode === "optimistic");
    const expected = analysis.scenarioSummaries.find((summary) => summary.mode === "expected");
    const conservative = analysis.scenarioSummaries.find((summary) => summary.mode === "conservative");

    expect(optimistic?.projectFinishDay).toBeLessThanOrEqual(expected?.projectFinishDay ?? 0);
    expect(conservative?.projectFinishDay).toBeGreaterThanOrEqual(expected?.projectFinishDay ?? 0);
  });
});
