import type { Lane, ScenarioMode, Task, ThreadlineScenario } from "./types";

const DEFAULT_COLORS = ["#e1843b", "#5cc6c0", "#f06478", "#7bb36a", "#d5b15d", "#8ea6ff"];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDay(day: number): string {
  return `Day ${Math.round(day)}`;
}

export function formatDuration(days: number): string {
  if (days === 1) {
    return "1 day";
  }

  return `${days} days`;
}

export function titleCaseStatus(status: Task["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function createDefaultLanes(): Lane[] {
  return [
    { id: createId("lane"), name: "Product", parallelism: 1, color: DEFAULT_COLORS[0] },
    { id: createId("lane"), name: "Engineering", parallelism: 2, color: DEFAULT_COLORS[1] },
    { id: createId("lane"), name: "Design", parallelism: 1, color: DEFAULT_COLORS[2] },
  ];
}

export function createEmptyScenario(): ThreadlineScenario {
  const now = new Date().toISOString();
  const lanes = createDefaultLanes();

  return {
    id: createId("scenario"),
    name: "New plan",
    description: "Map tasks, dependencies, capacity, and schedule risk.",
    deadlineDay: 24,
    mode: "expected",
    lanes,
    tasks: [
      {
        id: createId("task"),
        name: "Define the outcome",
        notes: "Clarify what done means before decomposing the work.",
        laneId: lanes[0].id,
        owner: "Lead",
        status: "todo",
        estimateDays: 2,
        confidence: 80,
        dependencies: [],
        earliestStartDay: null,
        mustFinishByDay: 4,
        deferrable: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function syncLane(lane: Lane, index: number): Lane {
  return {
    id: lane.id || createId("lane"),
    name: lane.name?.trim() || `Lane ${index + 1}`,
    parallelism: Math.max(1, Math.round(lane.parallelism || 1)),
    color: lane.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  };
}

function syncTask(task: Task, lanes: Lane[], index: number): Task {
  const fallbackLane = lanes[0];
  const hasLane = lanes.some((lane) => lane.id === task.laneId);

  return {
    id: task.id || createId("task"),
    name: task.name?.trim() || `Task ${index + 1}`,
    notes: task.notes ?? "",
    laneId: hasLane ? task.laneId : fallbackLane.id,
    owner: task.owner ?? "",
    status:
      task.status === "active" ||
      task.status === "blocked" ||
      task.status === "done" ||
      task.status === "todo"
        ? task.status
        : "todo",
    estimateDays: Math.max(1, Math.round(task.estimateDays || 1)),
    confidence: clamp(Math.round(task.confidence ?? 75), 5, 100),
    dependencies: Array.from(new Set(task.dependencies ?? [])).filter((value) => value !== task.id),
    earliestStartDay:
      typeof task.earliestStartDay === "number" && Number.isFinite(task.earliestStartDay)
        ? Math.max(0, Math.round(task.earliestStartDay))
        : null,
    mustFinishByDay:
      typeof task.mustFinishByDay === "number" && Number.isFinite(task.mustFinishByDay)
        ? Math.max(0, Math.round(task.mustFinishByDay))
        : null,
    deferrable: Boolean(task.deferrable),
  };
}

export function syncScenario(input: ThreadlineScenario): ThreadlineScenario {
  const lanes = (input.lanes?.length ? input.lanes : createDefaultLanes()).map(syncLane);
  const tasks = (input.tasks?.length ? input.tasks : createEmptyScenario().tasks).map((task, index) =>
    syncTask(task, lanes, index)
  );
  const validTaskIds = new Set(tasks.map((task) => task.id));
  const syncedTasks = tasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter((dependencyId) => validTaskIds.has(dependencyId)),
  }));

  return {
    id: input.id || createId("scenario"),
    name: input.name?.trim() || "Untitled plan",
    description: input.description ?? "",
    deadlineDay:
      typeof input.deadlineDay === "number" && Number.isFinite(input.deadlineDay)
        ? Math.max(0, Math.round(input.deadlineDay))
        : null,
    mode:
      input.mode === "optimistic" || input.mode === "conservative" || input.mode === "expected"
        ? input.mode
        : "expected",
    lanes,
    tasks: syncedTasks,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateTask(task: Task): Task {
  return {
    ...task,
    id: createId("task"),
    name: `${task.name} copy`,
    dependencies: [...task.dependencies],
  };
}

export function createTask(laneId: string): Task {
  return {
    id: createId("task"),
    name: "New task",
    notes: "",
    laneId,
    owner: "",
    status: "todo",
    estimateDays: 2,
    confidence: 75,
    dependencies: [],
    earliestStartDay: null,
    mustFinishByDay: null,
    deferrable: true,
  };
}

export function createLane(index: number): Lane {
  return {
    id: createId("lane"),
    name: `Lane ${index + 1}`,
    parallelism: 1,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  };
}

export function modeLabel(mode: ScenarioMode): string {
  if (mode === "optimistic") {
    return "Optimistic";
  }

  if (mode === "conservative") {
    return "Conservative";
  }

  return "Expected";
}
