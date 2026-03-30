export type ScenarioMode = "optimistic" | "expected" | "conservative";
export type TaskStatus = "todo" | "active" | "blocked" | "done";

export interface Lane {
  id: string;
  name: string;
  parallelism: number;
  color: string;
}

export interface Task {
  id: string;
  name: string;
  notes: string;
  laneId: string;
  owner: string;
  status: TaskStatus;
  estimateDays: number;
  confidence: number;
  dependencies: string[];
  earliestStartDay: number | null;
  mustFinishByDay: number | null;
  deferrable: boolean;
}

export interface ThreadlineScenario {
  id: string;
  name: string;
  description: string;
  deadlineDay: number | null;
  mode: ScenarioMode;
  lanes: Lane[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTask {
  task: Task;
  lane: Lane;
  effectiveDuration: number;
  startDay: number;
  endDay: number;
  dependencyReadyDay: number;
  resourceDelayDays: number;
  slotIndex: number;
  depth: number;
  slackDays: number;
  critical: boolean;
  downstreamTaskIds: string[];
  constraintIssues: string[];
}

export interface DelayImpact {
  taskId: string;
  slipDays: number;
  impactedTaskIds: string[];
}

export interface LaneSummary {
  lane: Lane;
  finishDay: number;
  delayedTaskCount: number;
  queueTaskIds: string[];
}

export interface ScenarioSummary {
  mode: ScenarioMode;
  projectFinishDay: number;
  deadlineMissDays: number;
  criticalPathIds: string[];
}

export interface Bottleneck {
  taskId: string;
  severity: number;
  kind: "critical-path" | "capacity" | "deadline";
  title: string;
  detail: string;
}

export interface RiskHotspot {
  taskId: string;
  score: number;
  delaySlipDays: number;
  downstreamCount: number;
}

export interface PlanSummary {
  headline: string;
  summary: string;
  safeToDeferIds: string[];
  cutCandidateIds: string[];
  bottleneckLaneId: string | null;
  riskiestTaskId: string | null;
}

export interface TaskExplanation {
  title: string;
  summary: string;
  riskSignals: string[];
  leverageMoves: string[];
  slipImpact: string;
}

export interface AnalysisResult {
  scheduledTasks: ScheduledTask[];
  scheduledTaskById: Record<string, ScheduledTask>;
  projectFinishDay: number;
  deadlineMissDays: number;
  cycleTaskIds: string[];
  criticalPathIds: string[];
  delayImpacts: Record<string, DelayImpact>;
  laneSummaries: LaneSummary[];
  scenarioSummaries: ScenarioSummary[];
  bottlenecks: Bottleneck[];
  riskHotspots: RiskHotspot[];
  planSummary: PlanSummary;
}
