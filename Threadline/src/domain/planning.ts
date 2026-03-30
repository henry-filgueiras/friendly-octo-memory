import { clamp, formatDay } from "./helpers";
import type {
  AnalysisResult,
  Bottleneck,
  DelayImpact,
  Lane,
  LaneSummary,
  PlanSummary,
  RiskHotspot,
  ScenarioMode,
  ScenarioSummary,
  ScheduledTask,
  Task,
  ThreadlineScenario,
} from "./types";

const MODES: ScenarioMode[] = ["optimistic", "expected", "conservative"];
const EPSILON = 1e-9;

interface BaseAnalysis {
  scheduledTasks: ScheduledTask[];
  scheduledTaskById: Record<string, ScheduledTask>;
  projectFinishDay: number;
  deadlineMissDays: number;
  cycleTaskIds: string[];
  criticalPathIds: string[];
  laneSummaries: LaneSummary[];
}

function roundDuration(value: number): number {
  return Math.max(1, Math.round(value));
}

export function getTaskDuration(task: Task, mode: ScenarioMode): number {
  if (task.status === "done") {
    return 0;
  }

  const uncertainty = clamp((100 - task.confidence) / 100, 0, 1);

  if (mode === "optimistic") {
    return roundDuration(task.estimateDays * (1 - uncertainty * 0.35));
  }

  if (mode === "conservative") {
    return roundDuration(task.estimateDays * (1 + uncertainty * 0.65));
  }

  return roundDuration(task.estimateDays);
}

function buildTaskMap(tasks: Task[]): Record<string, Task> {
  return Object.fromEntries(tasks.map((task) => [task.id, task]));
}

function topologicallySortTasks(tasks: Task[]): { orderedIds: string[]; cycleTaskIds: string[] } {
  const taskById = buildTaskMap(tasks);
  const originalIndex = new Map(tasks.map((task, index) => [task.id, index]));
  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  const children = new Map(tasks.map((task) => [task.id, [] as string[]]));

  tasks.forEach((task) => {
    task.dependencies.forEach((dependencyId) => {
      if (!taskById[dependencyId]) {
        return;
      }

      indegree.set(task.id, (indegree.get(task.id) || 0) + 1);
      children.get(dependencyId)?.push(task.id);
    });
  });

  const ready = tasks
    .filter((task) => (indegree.get(task.id) || 0) === 0)
    .map((task) => task.id)
    .sort((left, right) => (originalIndex.get(left) || 0) - (originalIndex.get(right) || 0));

  const orderedIds: string[] = [];

  while (ready.length > 0) {
    const currentId = ready.shift() as string;
    orderedIds.push(currentId);

    (children.get(currentId) || []).forEach((childId) => {
      const nextValue = (indegree.get(childId) || 0) - 1;
      indegree.set(childId, nextValue);

      if (nextValue === 0) {
        ready.push(childId);
        ready.sort(
          (left, right) => (originalIndex.get(left) || 0) - (originalIndex.get(right) || 0)
        );
      }
    });
  }

  const cycleTaskIds = tasks
    .map((task) => task.id)
    .filter((taskId) => !orderedIds.includes(taskId))
    .sort((left, right) => (originalIndex.get(left) || 0) - (originalIndex.get(right) || 0));

  return {
    orderedIds: [...orderedIds, ...cycleTaskIds],
    cycleTaskIds,
  };
}

function getDepths(orderedIds: string[], taskById: Record<string, Task>): Record<string, number> {
  const depthById: Record<string, number> = {};

  orderedIds.forEach((taskId) => {
    const task = taskById[taskId];
    depthById[taskId] = task.dependencies.length
      ? Math.max(
          ...task.dependencies
            .filter((dependencyId) => dependencyId in depthById)
            .map((dependencyId) => depthById[dependencyId] + 1)
        )
      : 0;
  });

  return depthById;
}

function chooseBestSlot(slots: number[], earliestReadyDay: number): { slotIndex: number; startDay: number } {
  let bestSlotIndex = 0;
  let bestStartDay = Math.max(earliestReadyDay, slots[0] || 0);

  for (let slotIndex = 1; slotIndex < slots.length; slotIndex += 1) {
    const startDay = Math.max(earliestReadyDay, slots[slotIndex]);

    if (startDay < bestStartDay - EPSILON || (Math.abs(startDay - bestStartDay) < EPSILON && slotIndex < bestSlotIndex)) {
      bestSlotIndex = slotIndex;
      bestStartDay = startDay;
    }
  }

  return {
    slotIndex: bestSlotIndex,
    startDay: bestStartDay,
  };
}

function getDownstreamMap(tasks: Task[]): Record<string, string[]> {
  const childrenById = new Map(tasks.map((task) => [task.id, [] as string[]]));

  tasks.forEach((task) => {
    task.dependencies.forEach((dependencyId) => {
      childrenById.get(dependencyId)?.push(task.id);
    });
  });

  const cache = new Map<string, string[]>();

  function visit(taskId: string): string[] {
    if (cache.has(taskId)) {
      return cache.get(taskId) as string[];
    }

    const seen = new Set<string>();

    (childrenById.get(taskId) || []).forEach((childId) => {
      seen.add(childId);
      visit(childId).forEach((nestedId) => seen.add(nestedId));
    });

    const result = Array.from(seen);
    cache.set(taskId, result);
    return result;
  }

  return Object.fromEntries(tasks.map((task) => [task.id, visit(task.id)]));
}

function buildLaneSummaries(lanes: Lane[], scheduledTasks: ScheduledTask[]): LaneSummary[] {
  return lanes.map((lane) => {
    const tasksInLane = scheduledTasks
      .filter((scheduledTask) => scheduledTask.lane.id === lane.id)
      .sort((left, right) => left.startDay - right.startDay || left.slotIndex - right.slotIndex);

    return {
      lane,
      finishDay: tasksInLane.length > 0 ? Math.max(...tasksInLane.map((task) => task.endDay)) : 0,
      delayedTaskCount: tasksInLane.filter((task) => task.resourceDelayDays > 0).length,
      queueTaskIds: tasksInLane.map((task) => task.task.id),
    };
  });
}

function buildBaseAnalysis(
  scenario: ThreadlineScenario,
  mode: ScenarioMode,
  durationOverrides: Partial<Record<string, number>> = {}
): BaseAnalysis {
  const lanes = scenario.lanes;
  const taskById = buildTaskMap(scenario.tasks);
  const laneById = Object.fromEntries(lanes.map((lane) => [lane.id, lane]));
  const { orderedIds, cycleTaskIds } = topologicallySortTasks(scenario.tasks);
  const depthById = getDepths(orderedIds, taskById);
  const downstreamById = getDownstreamMap(scenario.tasks);
  const slotAvailabilityByLaneId: Record<string, number[]> = Object.fromEntries(
    lanes.map((lane) => [lane.id, new Array(lane.parallelism).fill(0)])
  );
  const slotQueuesByLaneId: Record<string, string[][]> = Object.fromEntries(
    lanes.map((lane) => [lane.id, new Array(lane.parallelism).fill(null).map(() => [])])
  );
  const scheduledTaskById: Record<string, ScheduledTask> = {};

  orderedIds.forEach((taskId) => {
    const task = taskById[taskId];
    const lane = laneById[task.laneId] || lanes[0];
    const slots = slotAvailabilityByLaneId[lane.id] || [0];
    const effectiveDuration =
      typeof durationOverrides[task.id] === "number"
        ? Math.max(0, Math.round(durationOverrides[task.id] as number))
        : getTaskDuration(task, mode);
    const dependencyReadyDay =
      task.dependencies.length > 0
        ? Math.max(
            ...task.dependencies
              .map((dependencyId) => scheduledTaskById[dependencyId]?.endDay ?? 0)
          )
        : 0;
    const earliestReadyDay = Math.max(dependencyReadyDay, task.earliestStartDay ?? 0);
    const { slotIndex, startDay } = chooseBestSlot(slots, earliestReadyDay);
    const endDay = startDay + effectiveDuration;
    const constraintIssues: string[] = [];

    if (task.mustFinishByDay !== null && endDay > task.mustFinishByDay) {
      constraintIssues.push(
        `${task.name} needs to finish by ${formatDay(task.mustFinishByDay)} but currently lands on ${formatDay(endDay)}.`
      );
    }

    scheduledTaskById[task.id] = {
      task,
      lane,
      effectiveDuration,
      startDay,
      endDay,
      dependencyReadyDay,
      resourceDelayDays: Math.max(0, startDay - earliestReadyDay),
      slotIndex,
      depth: depthById[task.id] ?? 0,
      slackDays: 0,
      critical: false,
      downstreamTaskIds: downstreamById[task.id] ?? [],
      constraintIssues,
    };

    slots[slotIndex] = endDay;
    slotQueuesByLaneId[lane.id][slotIndex].push(task.id);
  });

  const scheduledTasks = orderedIds.map((taskId) => scheduledTaskById[taskId]);
  const projectFinishDay = scheduledTasks.length > 0 ? Math.max(...scheduledTasks.map((task) => task.endDay)) : 0;
  const deadlineMissDays =
    scenario.deadlineDay !== null ? Math.max(0, projectFinishDay - scenario.deadlineDay) : 0;

  const successorSets: Record<string, Set<string>> = Object.fromEntries(
    orderedIds.map((taskId) => [taskId, new Set<string>()])
  );
  const predecessorSets: Record<string, Set<string>> = Object.fromEntries(
    orderedIds.map((taskId) => [taskId, new Set<string>()])
  );

  scenario.tasks.forEach((task) => {
    task.dependencies.forEach((dependencyId) => {
      if (!scheduledTaskById[dependencyId]) {
        return;
      }

      successorSets[dependencyId].add(task.id);
      predecessorSets[task.id].add(dependencyId);
    });
  });

  Object.values(slotQueuesByLaneId).forEach((slotQueues) => {
    slotQueues.forEach((slotQueue) => {
      for (let index = 0; index < slotQueue.length - 1; index += 1) {
        const currentId = slotQueue[index];
        const nextId = slotQueue[index + 1];
        successorSets[currentId].add(nextId);
        predecessorSets[nextId].add(currentId);
      }
    });
  });

  const latestFinishById: Record<string, number> = {};
  const latestStartById: Record<string, number> = {};

  [...orderedIds].reverse().forEach((taskId) => {
    const scheduledTask = scheduledTaskById[taskId];
    const successors = Array.from(successorSets[taskId]);
    const latestFinish =
      successors.length === 0
        ? projectFinishDay
        : Math.min(...successors.map((successorId) => latestStartById[successorId]));

    latestFinishById[taskId] = latestFinish;
    latestStartById[taskId] = latestFinish - scheduledTask.effectiveDuration;
  });

  scheduledTasks.forEach((scheduledTask) => {
    const slackDays = Math.max(0, latestStartById[scheduledTask.task.id] - scheduledTask.startDay);
    scheduledTask.slackDays = slackDays;
    scheduledTask.critical = slackDays < EPSILON;
  });

  const criticalPathIds = scheduledTasks
    .filter((scheduledTask) => scheduledTask.critical)
    .map((scheduledTask) => scheduledTask.task.id);

  return {
    scheduledTasks,
    scheduledTaskById,
    projectFinishDay,
    deadlineMissDays,
    cycleTaskIds,
    criticalPathIds,
    laneSummaries: buildLaneSummaries(lanes, scheduledTasks),
  };
}

function buildDelayImpacts(
  scenario: ThreadlineScenario,
  mode: ScenarioMode,
  baseAnalysis: BaseAnalysis
): Record<string, DelayImpact> {
  const impacts: Record<string, DelayImpact> = {};

  baseAnalysis.scheduledTasks.forEach((scheduledTask) => {
    if (scheduledTask.effectiveDuration === 0) {
      impacts[scheduledTask.task.id] = {
        taskId: scheduledTask.task.id,
        slipDays: 0,
        impactedTaskIds: [],
      };
      return;
    }

    const delayed = buildBaseAnalysis(scenario, mode, {
      [scheduledTask.task.id]: scheduledTask.effectiveDuration + 1,
    });
    const impactedTaskIds = delayed.scheduledTasks
      .filter((candidate) => {
        const baseline = baseAnalysis.scheduledTaskById[candidate.task.id];
        return candidate.startDay !== baseline.startDay || candidate.endDay !== baseline.endDay;
      })
      .map((candidate) => candidate.task.id);

    impacts[scheduledTask.task.id] = {
      taskId: scheduledTask.task.id,
      slipDays: Math.max(0, delayed.projectFinishDay - baseAnalysis.projectFinishDay),
      impactedTaskIds,
    };
  });

  return impacts;
}

function buildRiskHotspots(
  scheduledTasks: ScheduledTask[],
  delayImpacts: Record<string, DelayImpact>
): RiskHotspot[] {
  return scheduledTasks
    .map((scheduledTask) => {
      const uncertainty = clamp((100 - scheduledTask.task.confidence) / 100, 0, 1);
      const delayImpact = delayImpacts[scheduledTask.task.id] ?? {
        taskId: scheduledTask.task.id,
        slipDays: 0,
        impactedTaskIds: [],
      };
      const score =
        uncertainty *
        (scheduledTask.effectiveDuration + 1) *
        (1 + scheduledTask.downstreamTaskIds.length * 0.4) *
        (1 + delayImpact.slipDays);

      return {
        taskId: scheduledTask.task.id,
        score,
        delaySlipDays: delayImpact.slipDays,
        downstreamCount: scheduledTask.downstreamTaskIds.length,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}

function buildBottlenecks(
  scheduledTasks: ScheduledTask[],
  laneSummaries: LaneSummary[],
  delayImpacts: Record<string, DelayImpact>
): Bottleneck[] {
  const laneById = Object.fromEntries(laneSummaries.map((summary) => [summary.lane.id, summary]));
  const bottlenecks: Bottleneck[] = [];

  scheduledTasks
    .filter((task) => task.critical)
    .forEach((task) => {
      const slip = delayImpacts[task.task.id]?.slipDays ?? 0;
      bottlenecks.push({
        taskId: task.task.id,
        severity: task.effectiveDuration + slip,
        kind: "critical-path",
        title: `${task.task.name} is on the critical path`,
        detail: `${task.task.name} has ${task.slackDays.toFixed(0)} days of slack and currently gates the finish through ${formatDay(task.endDay)}.`,
      });
    });

  scheduledTasks
    .filter((task) => task.resourceDelayDays > 0)
    .forEach((task) => {
      const laneSummary = laneById[task.lane.id];
      bottlenecks.push({
        taskId: task.task.id,
        severity: task.resourceDelayDays,
        kind: "capacity",
        title: `${task.lane.name} is queueing work`,
        detail: `${task.task.name} waits ${task.resourceDelayDays} days for lane capacity. ${laneSummary.lane.name} is the main queue here.`,
      });
    });

  scheduledTasks
    .flatMap((task) =>
      task.constraintIssues.map((issue) => ({
        taskId: task.task.id,
        severity: 10,
        kind: "deadline" as const,
        title: `${task.task.name} misses a local deadline`,
        detail: issue,
      }))
    )
    .forEach((bottleneck) => bottlenecks.push(bottleneck));

  return bottlenecks.sort((left, right) => right.severity - left.severity).slice(0, 8);
}

function buildScenarioSummaries(
  scenario: ThreadlineScenario,
  currentMode: ScenarioMode,
  currentBaseAnalysis: BaseAnalysis
): ScenarioSummary[] {
  return MODES.map((mode) => {
    if (mode === currentMode) {
      return {
        mode,
        projectFinishDay: currentBaseAnalysis.projectFinishDay,
        deadlineMissDays: currentBaseAnalysis.deadlineMissDays,
        criticalPathIds: currentBaseAnalysis.criticalPathIds,
      };
    }

    const analysis = buildBaseAnalysis(scenario, mode);
    return {
      mode,
      projectFinishDay: analysis.projectFinishDay,
      deadlineMissDays: analysis.deadlineMissDays,
      criticalPathIds: analysis.criticalPathIds,
    };
  });
}

function buildPlanSummary(
  scenario: ThreadlineScenario,
  baseAnalysis: BaseAnalysis,
  riskHotspots: RiskHotspot[],
  delayImpacts: Record<string, DelayImpact>
): PlanSummary {
  const bottleneckLane =
    [...baseAnalysis.laneSummaries].sort(
      (left, right) =>
        right.delayedTaskCount - left.delayedTaskCount || right.finishDay - left.finishDay
    )[0] ?? null;
  const safeToDeferIds = baseAnalysis.scheduledTasks
    .filter(
      (task) => task.task.deferrable && !task.critical && task.downstreamTaskIds.length === 0
    )
    .sort((left, right) => right.slackDays - left.slackDays)
    .slice(0, 3)
    .map((task) => task.task.id);
  const cutCandidateIds = baseAnalysis.scheduledTasks
    .filter((task) => task.task.deferrable && task.critical)
    .sort((left, right) => right.effectiveDuration - left.effectiveDuration)
    .slice(0, 3)
    .map((task) => task.task.id);
  const leadCriticalTask = baseAnalysis.scheduledTasks.find((task) => task.critical);
  const riskiestTaskId = riskHotspots[0]?.taskId ?? null;
  const leadRiskTask = riskiestTaskId
    ? baseAnalysis.scheduledTaskById[riskiestTaskId]
    : null;
  const deadlineText =
    scenario.deadlineDay === null
      ? `The current plan finishes on ${formatDay(baseAnalysis.projectFinishDay)} with no hard ship date set.`
      : baseAnalysis.deadlineMissDays > 0
        ? `The plan misses the target by ${baseAnalysis.deadlineMissDays} days and currently lands on ${formatDay(baseAnalysis.projectFinishDay)}.`
        : `The plan lands on ${formatDay(baseAnalysis.projectFinishDay)} and still keeps ${scenario.deadlineDay - baseAnalysis.projectFinishDay} days of schedule margin.`;
  const headline =
    baseAnalysis.deadlineMissDays > 0
      ? "The plan needs scope cuts or more capacity."
      : leadCriticalTask
        ? `${leadCriticalTask.task.name} is currently steering the finish line.`
        : "The plan has breathing room.";
  const summaryParts = [deadlineText];

  if (bottleneckLane && bottleneckLane.delayedTaskCount > 0) {
    summaryParts.push(
      `${bottleneckLane.lane.name} is the busiest lane, with ${bottleneckLane.delayedTaskCount} queued tasks.`
    );
  }

  if (leadRiskTask) {
    const delayImpact = delayImpacts[leadRiskTask.task.id];
    summaryParts.push(
      `${leadRiskTask.task.name} is the main schedule risk: a one-day slip there moves the finish by ${delayImpact?.slipDays ?? 0} days.`
    );
  }

  return {
    headline,
    summary: summaryParts.join(" "),
    safeToDeferIds,
    cutCandidateIds,
    bottleneckLaneId: bottleneckLane?.lane.id ?? null,
    riskiestTaskId,
  };
}

export function analyzeScenario(
  scenario: ThreadlineScenario,
  mode: ScenarioMode = scenario.mode
): AnalysisResult {
  const baseAnalysis = buildBaseAnalysis(scenario, mode);
  const delayImpacts = buildDelayImpacts(scenario, mode, baseAnalysis);
  const riskHotspots = buildRiskHotspots(baseAnalysis.scheduledTasks, delayImpacts);
  const bottlenecks = buildBottlenecks(
    baseAnalysis.scheduledTasks,
    baseAnalysis.laneSummaries,
    delayImpacts
  );
  const scenarioSummaries = buildScenarioSummaries(scenario, mode, baseAnalysis);
  const planSummary = buildPlanSummary(scenario, baseAnalysis, riskHotspots, delayImpacts);

  return {
    ...baseAnalysis,
    delayImpacts,
    riskHotspots,
    bottlenecks,
    scenarioSummaries,
    planSummary,
  };
}
