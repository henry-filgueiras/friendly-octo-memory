import { ChangeEvent, useEffect, useRef, useState } from "react";
import { getDemoScenarios } from "./data/demos";
import { buildTaskExplanation } from "./domain/explanations";
import {
  createLane,
  createTask,
  duplicateTask,
  formatDay,
  formatDuration,
  modeLabel,
  syncScenario,
  titleCaseStatus,
} from "./domain/helpers";
import { buildMarkdownSummary } from "./domain/markdown";
import { analyzeScenario, getTaskDuration } from "./domain/planning";
import type {
  AnalysisResult,
  Lane,
  ScheduledTask,
  ScenarioMode,
  Task,
  ThreadlineScenario,
} from "./domain/types";
import { loadScenario, saveScenario } from "./utils/storage";

type AnalysisView = "timeline" | "dependencies" | "diagnostics" | "scenarios";

const DEMOS = getDemoScenarios();

function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function numberInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function touchScenario(scenario: ThreadlineScenario): ThreadlineScenario {
  return syncScenario({
    ...scenario,
    updatedAt: new Date().toISOString(),
  });
}

function getStatusTone(status: Task["status"]): string {
  switch (status) {
    case "active":
      return "status-active";
    case "blocked":
      return "status-blocked";
    case "done":
      return "status-done";
    default:
      return "status-todo";
  }
}

function findTaskName(analysis: AnalysisResult, taskId: string): string {
  return analysis.scheduledTaskById[taskId]?.task.name || "Unknown task";
}

function groupTasksByLane(scheduledTasks: ScheduledTask[]): Array<{ lane: Lane; tasks: ScheduledTask[] }> {
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

function renderTimelineView(
  analysis: AnalysisResult,
  selectedTaskId: string | null,
  onSelectTask: (taskId: string) => void,
  deadlineDay: number | null
) {
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
                  Parallelism {group.lane.parallelism} • finishes {formatDay(
                    Math.max(...group.tasks.map((task) => task.endDay), 0)
                  )}
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
                    className={`timeline-task ${selectedTaskId === task.task.id ? "timeline-task--selected" : ""}`}
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

function renderDependencyView(
  analysis: AnalysisResult,
  selectedTaskId: string | null,
  onSelectTask: (taskId: string) => void
) {
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
                  fill={selectedTaskId === task.task.id ? "rgba(225, 132, 59, 0.18)" : "rgba(20, 27, 33, 0.92)"}
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

function renderDiagnosticsView(
  analysis: AnalysisResult,
  onSelectTask: (taskId: string) => void
) {
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

function renderScenarioView(analysis: AnalysisResult) {
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

export default function App() {
  const [scenario, setScenario] = useState<ThreadlineScenario>(() => loadScenario());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [analysisView, setAnalysisView] = useState<AnalysisView>("timeline");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveScenario(scenario);
  }, [scenario]);

  useEffect(() => {
    if (scenario.tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }

    if (!selectedTaskId || !scenario.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(scenario.tasks[0].id);
    }
  }, [scenario.tasks, selectedTaskId]);

  const analysis = analyzeScenario(scenario, scenario.mode);
  const taskExplanation = buildTaskExplanation(analysis, selectedTaskId);

  function commit(nextScenario: ThreadlineScenario | ((current: ThreadlineScenario) => ThreadlineScenario)) {
    setScenario((current) => touchScenario(typeof nextScenario === "function" ? nextScenario(current) : nextScenario));
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function updateLane(laneId: string, patch: Partial<Lane>) {
    commit((current) => ({
      ...current,
      lanes: current.lanes.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane)),
    }));
  }

  function addTaskForLane(laneId: string) {
    commit((current) => ({
      ...current,
      tasks: [...current.tasks, createTask(laneId)],
    }));
  }

  function duplicateTaskById(taskId: string) {
    commit((current) => {
      const task = current.tasks.find((entry) => entry.id === taskId);

      if (!task) {
        return current;
      }

      return {
        ...current,
        tasks: [...current.tasks, duplicateTask(task)],
      };
    });
  }

  function deleteTask(taskId: string) {
    commit((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== taskId)
        .map((task) => ({
          ...task,
          dependencies: task.dependencies.filter((dependencyId) => dependencyId !== taskId),
        })),
    }));
  }

  function addLaneHandler() {
    commit((current) => ({
      ...current,
      lanes: [...current.lanes, createLane(current.lanes.length)],
    }));
  }

  function deleteLane(laneId: string) {
    commit((current) => {
      if (current.lanes.length <= 1) {
        return current;
      }

      const remainingLanes = current.lanes.filter((lane) => lane.id !== laneId);
      const fallbackLaneId = remainingLanes[0].id;

      return {
        ...current,
        lanes: remainingLanes,
        tasks: current.tasks.map((task) => ({
          ...task,
          laneId: task.laneId === laneId ? fallbackLaneId : task.laneId,
        })),
      };
    });
  }

  function loadDemoScenario(demoId: string) {
    const demo = DEMOS.find((entry) => entry.id === demoId);

    if (!demo) {
      return;
    }

    setScenario(touchScenario(demo.scenario));
    setSelectedTaskId(demo.scenario.tasks[0]?.id ?? null);
    setAnalysisView("timeline");
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ThreadlineScenario | { scenario: ThreadlineScenario };
      const imported = syncScenario("scenario" in parsed ? parsed.scenario : parsed);
      setScenario(imported);
      setSelectedTaskId(imported.tasks[0]?.id ?? null);
    } catch {
      window.alert("Could not import that JSON file.");
    } finally {
      event.target.value = "";
    }
  }

  function exportJson() {
    downloadText("threadline-scenario.json", JSON.stringify(scenario, null, 2), "application/json");
  }

  function exportMarkdown() {
    downloadText("threadline-summary.md", buildMarkdownSummary(scenario, analysis), "text/markdown");
  }

  return (
    <div className="threadline-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Local-only planning instrument</p>
          <h1>Threadline</h1>
          <p className="hero-copy__lede">
            Turn a complicated goal into an executable plan by making dependencies, capacity,
            schedule risk, and slip impact visible.
          </p>
          <div className="pill-row">
            <span className="pill">No backend</span>
            <span className="pill">No analytics</span>
            <span className="pill">Deterministic scheduling</span>
            <span className="pill">Critical path and scenario views</span>
          </div>
        </div>
        <div className="hero-actions">
          <div className="hero-actions__block">
            <p className="eyebrow">Quick demos</p>
            <div className="demo-list">
              {DEMOS.map((demo) => (
                <button
                  type="button"
                  key={demo.id}
                  className="demo-card"
                  onClick={() => loadDemoScenario(demo.id)}
                >
                  <strong>{demo.label}</strong>
                  <span>{demo.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="hero-actions__block">
            <p className="eyebrow">Scenario controls</p>
            <div className="stacked-actions">
              <button type="button" className="ghost-button" onClick={exportJson}>
                Export JSON
              </button>
              <button type="button" className="ghost-button" onClick={exportMarkdown}>
                Export Markdown
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => importInputRef.current?.click()}
              >
                Import JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={handleImport}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="pane pane--editor">
          <section className="section-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Scenario</p>
                <h2>Plan framing</h2>
              </div>
            </div>
            <label className="field">
              <span>Name</span>
              <input
                value={scenario.name}
                onChange={(event) => commit({ ...scenario, name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                rows={4}
                value={scenario.description}
                onChange={(event) => commit({ ...scenario, description: event.target.value })}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Deadline day</span>
                <input
                  type="number"
                  min={0}
                  value={numberInputValue(scenario.deadlineDay)}
                  onChange={(event) =>
                    commit({
                      ...scenario,
                      deadlineDay:
                        event.target.value.trim() === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
              <div className="field">
                <span>Scenario mode</span>
                <div className="segmented-controls">
                  {(["optimistic", "expected", "conservative"] as ScenarioMode[]).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      className={scenario.mode === mode ? "tab-button tab-button--active" : "tab-button"}
                      onClick={() => commit({ ...scenario, mode })}
                    >
                      {modeLabel(mode)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Capacity</p>
                <h2>Lanes</h2>
              </div>
              <button type="button" className="ghost-button" onClick={addLaneHandler}>
                Add lane
              </button>
            </div>
            <div className="editor-stack">
              {scenario.lanes.map((lane) => (
                <article className="mini-card" key={lane.id}>
                  <div className="field-row">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={lane.name}
                        onChange={(event) => updateLane(lane.id, { name: event.target.value })}
                      />
                    </label>
                    <label className="field field--small">
                      <span>Parallelism</span>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={lane.parallelism}
                        onChange={(event) =>
                          updateLane(lane.id, { parallelism: Math.max(1, Number(event.target.value) || 1) })
                        }
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label className="field field--small">
                      <span>Color</span>
                      <input
                        type="color"
                        value={lane.color}
                        onChange={(event) => updateLane(lane.id, { color: event.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button ghost-button--danger"
                      onClick={() => deleteLane(lane.id)}
                      disabled={scenario.lanes.length <= 1}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="section-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Work</p>
                <h2>Tasks</h2>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => addTaskForLane(scenario.lanes[0]?.id || "")}
              >
                Add task
              </button>
            </div>
            <div className="editor-stack">
              {scenario.tasks.map((task) => (
                <article
                  className={`task-card ${selectedTaskId === task.id ? "task-card--selected" : ""}`}
                  key={task.id}
                >
                  <div className="task-card__header">
                    <button
                      type="button"
                      className="task-title-button"
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <strong>{task.name || "Untitled task"}</strong>
                    </button>
                    <span className={`status-chip ${getStatusTone(task.status)}`}>
                      {titleCaseStatus(task.status)}
                    </span>
                  </div>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={task.name}
                      onChange={(event) => updateTask(task.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows={2}
                      value={task.notes}
                      onChange={(event) => updateTask(task.id, { notes: event.target.value })}
                    />
                  </label>
                  <div className="field-row">
                    <label className="field">
                      <span>Lane</span>
                      <select
                        value={task.laneId}
                        onChange={(event) => updateTask(task.id, { laneId: event.target.value })}
                      >
                        {scenario.lanes.map((lane) => (
                          <option key={lane.id} value={lane.id}>
                            {lane.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={task.status}
                        onChange={(event) =>
                          updateTask(task.id, { status: event.target.value as Task["status"] })
                        }
                      >
                        <option value="todo">Todo</option>
                        <option value="active">Active</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                      </select>
                    </label>
                  </div>
                  <div className="field-row">
                    <label className="field field--small">
                      <span>Estimate</span>
                      <input
                        type="number"
                        min={1}
                        value={task.estimateDays}
                        onChange={(event) =>
                          updateTask(task.id, {
                            estimateDays: Math.max(1, Number(event.target.value) || 1),
                          })
                        }
                      />
                    </label>
                    <label className="field field--small">
                      <span>Confidence</span>
                      <input
                        type="number"
                        min={5}
                        max={100}
                        value={task.confidence}
                        onChange={(event) =>
                          updateTask(task.id, {
                            confidence: Math.max(5, Math.min(100, Number(event.target.value) || 5)),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Owner</span>
                      <input
                        value={task.owner}
                        onChange={(event) => updateTask(task.id, { owner: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label className="field field--small">
                      <span>Earliest start</span>
                      <input
                        type="number"
                        min={0}
                        value={numberInputValue(task.earliestStartDay)}
                        onChange={(event) =>
                          updateTask(task.id, {
                            earliestStartDay:
                              event.target.value.trim() === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="field field--small">
                      <span>Must finish by</span>
                      <input
                        type="number"
                        min={0}
                        value={numberInputValue(task.mustFinishByDay)}
                        onChange={(event) =>
                          updateTask(task.id, {
                            mustFinishByDay:
                              event.target.value.trim() === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={task.deferrable}
                      onChange={(event) => updateTask(task.id, { deferrable: event.target.checked })}
                    />
                    <span>Deferrable if the deadline gets tight</span>
                  </label>
                  <div className="dependency-picker">
                    <span>Dependencies</span>
                    <div className="dependency-pill-row">
                      {scenario.tasks
                        .filter((candidate) => candidate.id !== task.id)
                        .map((candidate) => {
                          const checked = task.dependencies.includes(candidate.id);

                          return (
                            <label
                              key={`${task.id}-${candidate.id}`}
                              className={`dependency-pill ${checked ? "dependency-pill--checked" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  const nextDependencies = event.target.checked
                                    ? [...task.dependencies, candidate.id]
                                    : task.dependencies.filter((dependencyId) => dependencyId !== candidate.id);

                                  updateTask(task.id, { dependencies: nextDependencies });
                                }}
                              />
                              <span>{candidate.name}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  <div className="task-card__footer">
                    <span className="muted-copy">
                      {modeLabel(scenario.mode)} duration: {formatDuration(getTaskDuration(task, scenario.mode))}
                    </span>
                    <div className="inline-actions">
                      <button type="button" className="ghost-button" onClick={() => duplicateTaskById(task.id)}>
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="ghost-button ghost-button--danger"
                        onClick={() => deleteTask(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <main className="pane pane--analysis">
          <section className="section-card section-card--analysis">
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
                  <strong>{scenario.deadlineDay !== null ? formatDay(scenario.deadlineDay) : "Unset"}</strong>
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
                onClick={() => setAnalysisView("timeline")}
              >
                Timeline
              </button>
              <button
                type="button"
                className={analysisView === "dependencies" ? "tab-button tab-button--active" : "tab-button"}
                onClick={() => setAnalysisView("dependencies")}
              >
                Dependencies
              </button>
              <button
                type="button"
                className={analysisView === "diagnostics" ? "tab-button tab-button--active" : "tab-button"}
                onClick={() => setAnalysisView("diagnostics")}
              >
                Diagnostics
              </button>
              <button
                type="button"
                className={analysisView === "scenarios" ? "tab-button tab-button--active" : "tab-button"}
                onClick={() => setAnalysisView("scenarios")}
              >
                Scenarios
              </button>
            </div>

            {analysisView === "timeline"
              ? renderTimelineView(analysis, selectedTaskId, setSelectedTaskId, scenario.deadlineDay)
              : null}
            {analysisView === "dependencies"
              ? renderDependencyView(analysis, selectedTaskId, setSelectedTaskId)
              : null}
            {analysisView === "diagnostics"
              ? renderDiagnosticsView(analysis, setSelectedTaskId)
              : null}
            {analysisView === "scenarios" ? renderScenarioView(analysis) : null}
          </section>
        </main>

        <aside className="pane pane--inspector">
          <section className="section-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Explanation</p>
                <h2>Why the plan behaves this way</h2>
              </div>
            </div>
            <article className="summary-panel">
              <strong>{analysis.planSummary.headline}</strong>
              <p>{analysis.planSummary.summary}</p>
            </article>

            <div className="inspector-list">
              <article className="summary-panel">
                <span className="eyebrow">Safe to defer</span>
                <ul className="clean-list">
                  {analysis.planSummary.safeToDeferIds.length > 0 ? (
                    analysis.planSummary.safeToDeferIds.map((taskId) => (
                      <li key={taskId}>{findTaskName(analysis, taskId)}</li>
                    ))
                  ) : (
                    <li>No obvious defer candidates yet.</li>
                  )}
                </ul>
              </article>
              <article className="summary-panel">
                <span className="eyebrow">Cut first if needed</span>
                <ul className="clean-list">
                  {analysis.planSummary.cutCandidateIds.length > 0 ? (
                    analysis.planSummary.cutCandidateIds.map((taskId) => (
                      <li key={taskId}>{findTaskName(analysis, taskId)}</li>
                    ))
                  ) : (
                    <li>No deferrable critical-path work is flagged yet.</li>
                  )}
                </ul>
              </article>
            </div>

            {taskExplanation ? (
              <article className="summary-panel summary-panel--task">
                <span className="eyebrow">Selected task</span>
                <strong>{taskExplanation.title}</strong>
                <p>{taskExplanation.summary}</p>
                <div className="summary-panel__section">
                  <span className="eyebrow">Risk signals</span>
                  <ul className="clean-list">
                    {taskExplanation.riskSignals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </div>
                <div className="summary-panel__section">
                  <span className="eyebrow">Leverage moves</span>
                  <ul className="clean-list">
                    {taskExplanation.leverageMoves.map((move) => (
                      <li key={move}>{move}</li>
                    ))}
                  </ul>
                </div>
                <p>{taskExplanation.slipImpact}</p>
              </article>
            ) : (
              <article className="summary-panel">
                <strong>Select a task</strong>
                <p>The right pane explains the selected task in plain English.</p>
              </article>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
