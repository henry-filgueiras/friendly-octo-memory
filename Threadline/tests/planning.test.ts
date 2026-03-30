import { describe, expect, it } from "vitest";
import { buildExecutionPlanArtifact } from "../src/domain/artifacts";
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

function createCycleScenario(): ThreadlineScenario {
  return syncScenario({
    id: "scenario-cycle",
    name: "Cycle test",
    description: "Ensures cyclic dependencies stay deterministic and non-fatal.",
    deadlineDay: 10,
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
        estimateDays: 2,
        confidence: 80,
        dependencies: ["b"],
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
        estimateDays: 3,
        confidence: 70,
        dependencies: ["a"],
        earliestStartDay: null,
        mustFinishByDay: null,
        deferrable: false,
      },
      {
        id: "c",
        name: "C",
        notes: "",
        laneId: "eng",
        owner: "",
        status: "todo",
        estimateDays: 1,
        confidence: 90,
        dependencies: ["b"],
        earliestStartDay: null,
        mustFinishByDay: null,
        deferrable: true,
      },
    ],
  });
}

function createDoneTaskScenario(): ThreadlineScenario {
  return syncScenario({
    id: "scenario-done-risk",
    name: "Done risk test",
    description: "Ensures completed tasks do not top the risk ranking.",
    deadlineDay: 20,
    mode: "expected",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    lanes: [{ id: "eng", name: "Engineering", parallelism: 1, color: "#5cc6c0" }],
    tasks: [
      {
        id: "done-task",
        name: "Already done",
        notes: "",
        laneId: "eng",
        owner: "",
        status: "done",
        estimateDays: 9,
        confidence: 5,
        dependencies: [],
        earliestStartDay: null,
        mustFinishByDay: null,
        deferrable: false,
      },
      {
        id: "active-task",
        name: "Active task",
        notes: "",
        laneId: "eng",
        owner: "",
        status: "active",
        estimateDays: 4,
        confidence: 50,
        dependencies: [],
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

  it("survives a small dependency cycle and returns deterministic scheduled tasks", () => {
    const analysis = analyzeScenario(createCycleScenario());

    expect(analysis.cycleTaskIds).toEqual(["a", "b", "c"]);
    expect(analysis.scheduledTasks.map((entry) => entry.task.id)).toEqual(["a", "b", "c"]);
    expect(Number.isFinite(analysis.scheduledTaskById.a.depth)).toBe(true);
    expect(Number.isFinite(analysis.scheduledTaskById.b.depth)).toBe(true);
    expect(Number.isFinite(analysis.scheduledTaskById.c.depth)).toBe(true);
    expect(analysis.scheduledTaskById.a.downstreamTaskIds).toContain("b");
    expect(analysis.scheduledTaskById.a.downstreamTaskIds).toContain("c");
  });

  it("keeps done tasks out of the top risk hotspots", () => {
    const analysis = analyzeScenario(createDoneTaskScenario());

    expect(analysis.riskHotspots.some((entry) => entry.taskId === "done-task")).toBe(false);
    expect(analysis.riskHotspots[0]?.taskId).toBe("active-task");
  });

  it("exports a compact execution plan artifact with scenario provenance", () => {
    const scenario = createScenario();
    const analysis = analyzeScenario(scenario);
    const artifact = buildExecutionPlanArtifact(scenario, analysis);

    expect(artifact.kind).toBe("ExecutionPlan");
    expect(artifact.payload.subject).toBe("Capacity test");
    expect(artifact.payload.projectFinishDay).toBe(analysis.projectFinishDay);
    expect(artifact.payload.tasks[0]?.id).toBe("a");
    expect(artifact.payload.tasks[0]?.critical).toBe(true);
    expect(artifact.provenance.sourceScenario?.scenarioId).toBe("scenario-test");
  });
});
