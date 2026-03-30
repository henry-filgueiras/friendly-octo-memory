import { useEffect, useState } from "react";
import { createLane, createTask, duplicateTask, syncScenario } from "../domain/helpers";
import { analyzeScenario } from "../domain/planning";
import type { AnalysisView } from "../components/AnalysisPane";
import type { Lane, Task, ThreadlineScenario } from "../domain/types";
import { loadScenario, saveScenario } from "../utils/storage";

function touchScenario(scenario: ThreadlineScenario): ThreadlineScenario {
  return syncScenario({
    ...scenario,
    updatedAt: new Date().toISOString(),
  });
}

export function useThreadlineScenarioState() {
  const [scenario, setScenario] = useState<ThreadlineScenario>(() => loadScenario());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [analysisView, setAnalysisView] = useState<AnalysisView>("timeline");

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

  function commitScenario(
    nextScenario: ThreadlineScenario | ((current: ThreadlineScenario) => ThreadlineScenario)
  ) {
    setScenario((current) =>
      touchScenario(typeof nextScenario === "function" ? nextScenario(current) : nextScenario)
    );
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    commitScenario((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function updateLane(laneId: string, patch: Partial<Lane>) {
    commitScenario((current) => ({
      ...current,
      lanes: current.lanes.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane)),
    }));
  }

  function addTaskForLane(laneId: string) {
    commitScenario((current) => ({
      ...current,
      tasks: [...current.tasks, createTask(laneId)],
    }));
  }

  function duplicateTaskById(taskId: string) {
    commitScenario((current) => {
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
    commitScenario((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== taskId)
        .map((task) => ({
          ...task,
          dependencies: task.dependencies.filter((dependencyId) => dependencyId !== taskId),
        })),
    }));
  }

  function addLane() {
    commitScenario((current) => ({
      ...current,
      lanes: [...current.lanes, createLane(current.lanes.length)],
    }));
  }

  function deleteLane(laneId: string) {
    commitScenario((current) => {
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

  function replaceScenario(nextScenario: ThreadlineScenario) {
    setScenario(touchScenario(nextScenario));
    setSelectedTaskId(nextScenario.tasks[0]?.id ?? null);
  }

  function loadDemoScenario(nextScenario: ThreadlineScenario) {
    replaceScenario(nextScenario);
    setAnalysisView("timeline");
  }

  return {
    analysis: analyzeScenario(scenario, scenario.mode),
    analysisView,
    commitScenario,
    addLane,
    addTaskForLane,
    deleteLane,
    deleteTask,
    duplicateTaskById,
    loadDemoScenario,
    replaceScenario,
    scenario,
    selectedTaskId,
    setAnalysisView,
    setSelectedTaskId,
    updateLane,
    updateTask,
  };
}
