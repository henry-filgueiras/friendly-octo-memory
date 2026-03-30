import type { RefObject } from "react";
import { formatDay, formatDuration, modeLabel } from "../domain/helpers";
import type {
  AnalysisResult,
  Lane,
  ScheduledTask,
} from "../domain/types";

export type AnalysisView = "timeline" | "dependencies" | "diagnostics" | "scenarios";

interface AnalysisPaneProps {
  analysis: AnalysisResult;
  analysisView: AnalysisView;
  deadlineDay: number | null;
  isGuidedDemoFocused: boolean;
  paneRef: RefObject<HTMLElement>;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onSetAnalysisView: (view: AnalysisView) => void;
}

function findTaskName(analysis: AnalysisResult, taskId: string): string {
  return analysis.scheduledTaskById[taskId]?.task.name || "Unknown task";
}

function groupTasksByLane(
  scheduledTasks: ScheduledTask[]
): Array<{ lane: Lane; tasks: ScheduledTask[] }> {
  const laneMap = new Map<string, { lane: Lane; tasks: ScheduledTask[] }>();

  scheduledTasks.forEach((scheduledTask) => {
    if (!laneMap.has(scheduledTask.lane.id)) {
      laneMap.set(scheduledTask.lane.id, { lane: scheduledTask.lane, tasks: [] });
    }

    laneMap.get(scheduledTask.lane.id)?.tasks.push(scheduledTask);
  });

  return Array.from(laneMap.values()).map((entry) => ({
    lane: entry.lane,
    tasks: [...entry.tasks].sort(
      (left, right) => left.startDay - right.startDay || left.slotIndex - right.slotIndex
    ),
  }));
}

function TimelineView({
  analysis,
  deadlineDay,
  selectedTaskId,
  onSelectTask,
}: {
  analysis: AnalysisResult;
  deadlineDay: number | null;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}) {
  const horizon = Math.max(analysis.projectFinishDay, deadlineDay ?? 0, 1) + 1;
  const laneGroups = groupTasksByLane(analysis.scheduledTasks);

  return (
    <div className="analysis-stack">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Timeline</p>
          <h3>Lane-aware schedule</h3>
        </div>
        <p className="analysis-note">
          Bars start only when both dependencies and lane capacity allow them to start.
        </p>
      </div>
      <div className="timeline-ruler">
        {Array.from({ length: horizon + 1 }, (_, day) => (
          <span key={`ruler-${day}`}>{day}</span>
        ))}
      </div>
      <div className="timeline-board">
        {laneGroups.map((group) => (
          <section className="lane-strip" key={group.lane.id}>
            <div className="lane-strip__header">
              <span
                className="lane-chip"
                style={{ backgroundColor: group.lane.color }}
                aria-hidden="true"
              />
              <div>
                <strong>{group.lane.name}</strong>
                <p>
                  Parallelism {group.lane.parallelism} • finishes{" "}
                  {formatDay(Math.max(...group.tasks.map((task) => task.endDay), 0))}
                </p>
              </div>
            </div>
            <div className="lane-strip__rows">
              {group.tasks.map((task) => {
                const left = (task.startDay / horizon) * 100;
                const width = Math.max(3, ((task.endDay - task.startDay) / horizon) * 100);

                return (
                  <button
                    type="button"
                    key={task.task.id}
                    className={`timeline-task ${
                      selectedTaskId === task.task.id ? "timeline-task--selected" : ""
                    }`}
                    onClick={() => onSelectTask(task.task.id)}
                  >
                    <div className="timeline-task__meta">
                      <span>{task.task.name}</span>
                      <span>
                        {formatDay(task.startDay)} to {formatDay(task.endDay)}
                      </span>
                    </div>
                    <div className="timeline-track">
                      {deadlineDay !== null ? (
                        <div
                          className="deadline-marker"
                          style={{ left: `${(deadlineDay / horizon) * 100}%` }}
                        />
                      ) : null}
                      <div
                        className={`timeline-bar ${task.critical ? "timeline-bar--critical" : ""}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          borderColor: task.lane.color,
                          backgroundColor: `${task.lane.color}33`,
                        }}
                      >
                        <span>{task.task.name}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DependencyView({
  analysis,
  selectedTaskId,
  onSelectTask,
}: {
  analysis: AnalysisResult;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}) {
  const groups = new Map<number, ScheduledTask[]>();
  let maxDepth = 0;
  let maxRows = 0;

  analysis.scheduledTasks.forEach((scheduledTask) => {
    if (!groups.has(scheduledTask.depth)) {
      groups.set(scheduledTask.depth, []);
    }

    groups.get(scheduledTask.depth)?.push(scheduledTask);
    maxDepth = Math.max(maxDepth, scheduledTask.depth);
  });

  Array.from(groups.values()).forEach((group) => {
    group.sort((left, right) => left.startDay - right.startDay);
    maxRows = Math.max(maxRows, group.length);
  });

  const positions: Record<string, { x: number; y: number }> = {};
  const width = Math.max(760, (maxDepth + 1) * 230 + 180);
  const height = Math.max(320, maxRows * 120 + 100);

  Array.from(groups.entries()).forEach(([depth, tasks]) => {
    tasks.forEach((task, rowIndex) => {
      positions[task.task.id] = {
        x: 70 + depth * 220,
        y: 60 + rowIndex * 110,
      };
    });
  });

  return (
    <div className="analysis-stack">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Dependencies</p>
          <h3>Dependency map</h3>
        </div>
        <p className="analysis-note">
          Depth is driven by prerequisites. Node color comes from the assigned lane.
        </p>
      </div>
      <div className="graph-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="dependency-graph" role="img">
          {analysis.scheduledTasks.flatMap((task) =>
            task.task.dependencies.map((dependencyId) => {
              const source = positions[dependencyId];
              const target = positions[task.task.id];

              if (!source || !target) {
                return null;
              }

              return (
                <path
                  key={`${dependencyId}-${task.task.id}`}
                  d={`M ${source.x + 152} ${source.y + 36} C ${source.x + 190} ${source.y + 36}, ${target.x - 26} ${target.y + 36}, ${target.x} ${target.y + 36}`}
                  fill="none"
                  stroke="rgba(240, 236, 225, 0.22)"
                  strokeWidth={2}
                />
              );
            })
          )}
          {analysis.scheduledTasks.map((task) => {
            const position = positions[task.task.id];

            return (
              <g
                key={task.task.id}
                className="graph-node"
                onClick={() => onSelectTask(task.task.id)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={position.x}
                  y={position.y}
                  width={152}
                  height={72}
                  rx={18}
                  fill={
                    selectedTaskId === task.task.id
                      ? "rgba(225, 132, 59, 0.18)"
                      : "rgba(20, 27, 33, 0.92)"
                  }
                  stroke={task.lane.color}
                  strokeWidth={task.critical ? 2.5 : 1.5}
                />
                <text x={position.x + 14} y={position.y + 24} className="graph-node__title">
                  {task.task.name}
                </text>
                <text x={position.x + 14} y={position.y + 44} className="graph-node__meta">
                  {task.lane.name} • {formatDuration(task.effectiveDuration)}
                </text>
                <text x={position.x + 14} y={position.y + 60} className="graph-node__meta">
                  {formatDay(task.startDay)} to {formatDay(task.endDay)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DiagnosticsView({
  analysis,
  onSelectTask,
}: {
  analysis: AnalysisResult;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <div className="analysis-stack">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h3>Bottlenecks and risk</h3>
        </div>
        <p className="analysis-note">
          These signals are derived from critical path, lane queueing, deadlines, and slip impact.
        </p>
      </div>
      <div className="diagnostic-grid">
        <section className="diagnostic-panel">
          <h4>Main bottlenecks</h4>
          {analysis.bottlenecks.length === 0 ? (
            <p className="muted-copy">No bottlenecks detected yet.</p>
          ) : (
            analysis.bottlenecks.map((bottleneck) => (
              <button
                type="button"
                key={`${bottleneck.kind}-${bottleneck.taskId}-${bottleneck.title}`}
                className="diagnostic-card"
                onClick={() => onSelectTask(bottleneck.taskId)}
              >
                <span className="diagnostic-card__kind">{bottleneck.kind}</span>
                <strong>{bottleneck.title}</strong>
                <p>{bottleneck.detail}</p>
              </button>
            ))
          )}
        </section>
        <section className="diagnostic-panel">
          <h4>Risk hotspots</h4>
          {analysis.riskHotspots.map((hotspot) => (
            <button
              type="button"
              key={hotspot.taskId}
              className="diagnostic-card"
              onClick={() => onSelectTask(hotspot.taskId)}
            >
              <strong>{findTaskName(analysis, hotspot.taskId)}</strong>
              <p>
                1-day slip pushes finish by {formatDuration(hotspot.delaySlipDays)} and fans out to{" "}
                {hotspot.downstreamCount} downstream tasks.
              </p>
            </button>
          ))}
        </section>
        <section className="diagnostic-panel">
          <h4>Lane load</h4>
          {analysis.laneSummaries.map((laneSummary) => (
            <article className="diagnostic-card diagnostic-card--static" key={laneSummary.lane.id}>
              <strong>{laneSummary.lane.name}</strong>
              <p>
                Finishes {formatDay(laneSummary.finishDay)} • {laneSummary.delayedTaskCount} queued
                tasks
              </p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function ScenarioView({ analysis }: { analysis: AnalysisResult }) {
  const expected = analysis.scenarioSummaries.find((summary) => summary.mode === "expected");

  return (
    <div className="analysis-stack">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Scenario diff</p>
          <h3>How the finish moves under uncertainty</h3>
        </div>
        <p className="analysis-note">
          Confidence widens or narrows task durations. The ordering stays deterministic.
        </p>
      </div>
      <div className="scenario-grid">
        {analysis.scenarioSummaries.map((summary) => {
          const delta = expected ? summary.projectFinishDay - expected.projectFinishDay : 0;

          return (
            <article className="scenario-card" key={summary.mode}>
              <p className="eyebrow">{modeLabel(summary.mode)}</p>
              <strong>{formatDay(summary.projectFinishDay)}</strong>
              <p>
                {delta === 0
                  ? "Same finish as the expected case."
                  : delta > 0
                    ? `${formatDuration(delta)} slower than expected.`
                    : `${formatDuration(Math.abs(delta))} faster than expected.`}
              </p>
              <p>
                Critical path:{" "}
                {summary.criticalPathIds
                  .map((taskId) => findTaskName(analysis, taskId))
                  .join(" -> ") || "None"}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function AnalysisPane({
  analysis,
  analysisView,
  deadlineDay,
  isGuidedDemoFocused,
  paneRef,
  selectedTaskId,
  onSelectTask,
  onSetAnalysisView,
}: AnalysisPaneProps) {
  return (
    <main
      ref={paneRef}
      className={`pane pane--analysis ${isGuidedDemoFocused ? "pane--guided-focus" : ""}`}
    >
      <section className="section-card section-card--analysis">
        {isGuidedDemoFocused ? (
          <div className="analysis-focus-badge">
            <span className="analysis-focus-badge__dot" aria-hidden="true" />
            Guided demo focus: watch this pane
          </div>
        ) : null}
        <div className="section-heading">
          <div>
            <p className="eyebrow">Analysis</p>
            <h2>Plan behavior</h2>
          </div>
          <div className="metric-grid">
            <article className="metric-card">
              <span>Finish</span>
              <strong>{formatDay(analysis.projectFinishDay)}</strong>
            </article>
            <article className="metric-card">
              <span>Deadline</span>
              <strong>{deadlineDay !== null ? formatDay(deadlineDay) : "Unset"}</strong>
            </article>
            <article className="metric-card">
              <span>Critical tasks</span>
              <strong>{analysis.criticalPathIds.length}</strong>
            </article>
            <article className="metric-card">
              <span>Deadline miss</span>
              <strong>{formatDuration(analysis.deadlineMissDays)}</strong>
            </article>
          </div>
        </div>

        {analysis.cycleTaskIds.length > 0 ? (
          <div className="warning-banner">
            <strong>Dependency cycle detected.</strong>
            <span>
              These tasks are still shown deterministically, but the cycle should be fixed:{" "}
              {analysis.cycleTaskIds.map((taskId) => findTaskName(analysis, taskId)).join(", ")}
            </span>
          </div>
        ) : null}

        <div className="segmented-controls">
          <button
            type="button"
            className={analysisView === "timeline" ? "tab-button tab-button--active" : "tab-button"}
            onClick={() => onSetAnalysisView("timeline")}
          >
            Timeline
          </button>
          <button
            type="button"
            className={
              analysisView === "dependencies" ? "tab-button tab-button--active" : "tab-button"
            }
            onClick={() => onSetAnalysisView("dependencies")}
          >
            Dependencies
          </button>
          <button
            type="button"
            className={
              analysisView === "diagnostics" ? "tab-button tab-button--active" : "tab-button"
            }
            onClick={() => onSetAnalysisView("diagnostics")}
          >
            Diagnostics
          </button>
          <button
            type="button"
            className={analysisView === "scenarios" ? "tab-button tab-button--active" : "tab-button"}
            onClick={() => onSetAnalysisView("scenarios")}
          >
            Scenarios
          </button>
        </div>

        {analysisView === "timeline" ? (
          <TimelineView
            analysis={analysis}
            deadlineDay={deadlineDay}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
          />
        ) : null}
        {analysisView === "dependencies" ? (
          <DependencyView
            analysis={analysis}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
          />
        ) : null}
        {analysisView === "diagnostics" ? (
          <DiagnosticsView analysis={analysis} onSelectTask={onSelectTask} />
        ) : null}
        {analysisView === "scenarios" ? <ScenarioView analysis={analysis} /> : null}
      </section>
    </main>
  );
}
