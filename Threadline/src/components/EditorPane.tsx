import { formatDuration, modeLabel, titleCaseStatus } from "../domain/helpers";
import { getTaskDuration } from "../domain/planning";
import type { Lane, ScenarioMode, Task, ThreadlineScenario } from "../domain/types";

interface EditorPaneProps {
  scenario: ThreadlineScenario;
  selectedTaskId: string | null;
  onAddLane: () => void;
  onAddTaskForLane: (laneId: string) => void;
  onCommitScenario: (scenario: ThreadlineScenario) => void;
  onDeleteLane: (laneId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  onUpdateLane: (laneId: string, patch: Partial<Lane>) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
}

function numberInputValue(value: number | null): string {
  return value === null ? "" : String(value);
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

function ScenarioSection({
  scenario,
  onCommitScenario,
}: {
  scenario: ThreadlineScenario;
  onCommitScenario: (scenario: ThreadlineScenario) => void;
}) {
  return (
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
          onChange={(event) => onCommitScenario({ ...scenario, name: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          rows={4}
          value={scenario.description}
          onChange={(event) => onCommitScenario({ ...scenario, description: event.target.value })}
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
              onCommitScenario({
                ...scenario,
                deadlineDay: event.target.value.trim() === "" ? null : Number(event.target.value),
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
                onClick={() => onCommitScenario({ ...scenario, mode })}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LanesSection({
  lanes,
  onAddLane,
  onDeleteLane,
  onUpdateLane,
}: {
  lanes: ThreadlineScenario["lanes"];
  onAddLane: () => void;
  onDeleteLane: (laneId: string) => void;
  onUpdateLane: (laneId: string, patch: Partial<Lane>) => void;
}) {
  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Capacity</p>
          <h2>Lanes</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onAddLane}>
          Add lane
        </button>
      </div>
      <div className="editor-stack">
        {lanes.map((lane) => (
          <article className="mini-card" key={lane.id}>
            <div className="field-row">
              <label className="field">
                <span>Name</span>
                <input
                  value={lane.name}
                  onChange={(event) => onUpdateLane(lane.id, { name: event.target.value })}
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
                    onUpdateLane(lane.id, {
                      parallelism: Math.max(1, Number(event.target.value) || 1),
                    })
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
                  onChange={(event) => onUpdateLane(lane.id, { color: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="ghost-button ghost-button--danger"
                onClick={() => onDeleteLane(lane.id)}
                disabled={lanes.length <= 1}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TasksSection({
  scenario,
  selectedTaskId,
  onAddTaskForLane,
  onDeleteTask,
  onDuplicateTask,
  onSelectTask,
  onUpdateTask,
}: {
  scenario: ThreadlineScenario;
  selectedTaskId: string | null;
  onAddTaskForLane: (laneId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
}) {
  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Work</p>
          <h2>Tasks</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onAddTaskForLane(scenario.lanes[0]?.id || "")}
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
                onClick={() => onSelectTask(task.id)}
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
                onChange={(event) => onUpdateTask(task.id, { name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={task.notes}
                onChange={(event) => onUpdateTask(task.id, { notes: event.target.value })}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Lane</span>
                <select
                  value={task.laneId}
                  onChange={(event) => onUpdateTask(task.id, { laneId: event.target.value })}
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
                    onUpdateTask(task.id, { status: event.target.value as Task["status"] })
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
                    onUpdateTask(task.id, {
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
                    onUpdateTask(task.id, {
                      confidence: Math.max(5, Math.min(100, Number(event.target.value) || 5)),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Owner</span>
                <input
                  value={task.owner}
                  onChange={(event) => onUpdateTask(task.id, { owner: event.target.value })}
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
                    onUpdateTask(task.id, {
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
                    onUpdateTask(task.id, {
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
                onChange={(event) => onUpdateTask(task.id, { deferrable: event.target.checked })}
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
                              : task.dependencies.filter(
                                  (dependencyId) => dependencyId !== candidate.id
                                );

                            onUpdateTask(task.id, { dependencies: nextDependencies });
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
                {modeLabel(scenario.mode)} duration:{" "}
                {formatDuration(getTaskDuration(task, scenario.mode))}
              </span>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onDuplicateTask(task.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="ghost-button ghost-button--danger"
                  onClick={() => onDeleteTask(task.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function EditorPane(props: EditorPaneProps) {
  return (
    <aside className="pane pane--editor">
      <ScenarioSection
        scenario={props.scenario}
        onCommitScenario={props.onCommitScenario}
      />
      <LanesSection
        lanes={props.scenario.lanes}
        onAddLane={props.onAddLane}
        onDeleteLane={props.onDeleteLane}
        onUpdateLane={props.onUpdateLane}
      />
      <TasksSection
        scenario={props.scenario}
        selectedTaskId={props.selectedTaskId}
        onAddTaskForLane={props.onAddTaskForLane}
        onDeleteTask={props.onDeleteTask}
        onDuplicateTask={props.onDuplicateTask}
        onSelectTask={props.onSelectTask}
        onUpdateTask={props.onUpdateTask}
      />
    </aside>
  );
}
