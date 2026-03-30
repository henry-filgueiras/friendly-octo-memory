import { ChangeEvent, useRef } from "react";
import { AnalysisPane } from "./components/AnalysisPane";
import { EditorPane } from "./components/EditorPane";
import { HeroPanel } from "./components/HeroPanel";
import { InspectorPane } from "./components/InspectorPane";
import { getDemoScenarios } from "./data/demos";
import { buildTaskExplanation } from "./domain/explanations";
import { buildMarkdownSummary } from "./domain/markdown";
import { syncScenario } from "./domain/helpers";
import type { ThreadlineScenario } from "./domain/types";
import { useThreadlineScenarioState } from "./hooks/useThreadlineScenarioState";
import { downloadText } from "./utils/download";

const DEMOS = getDemoScenarios();

export default function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const {
    analysis,
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
  } = useThreadlineScenarioState();
  const taskExplanation = buildTaskExplanation(analysis, selectedTaskId);

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ThreadlineScenario | { scenario: ThreadlineScenario };
      replaceScenario(syncScenario("scenario" in parsed ? parsed.scenario : parsed));
    } catch {
      window.alert("Could not import that JSON file.");
    } finally {
      event.target.value = "";
    }
  }

  function exportJson() {
    downloadText(
      "threadline-scenario.json",
      JSON.stringify(scenario, null, 2),
      "application/json"
    );
  }

  function exportMarkdown() {
    downloadText(
      "threadline-summary.md",
      buildMarkdownSummary(scenario, analysis),
      "text/markdown"
    );
  }

  function handleLoadDemo(demoId: string) {
    const demo = DEMOS.find((entry) => entry.id === demoId);

    if (!demo) {
      return;
    }

    loadDemoScenario(demo.scenario);
  }

  return (
    <div className="threadline-shell">
      <HeroPanel
        demos={DEMOS}
        importInputRef={importInputRef}
        onExportJson={exportJson}
        onExportMarkdown={exportMarkdown}
        onImport={handleImport}
        onLoadDemo={handleLoadDemo}
      />

      <div className="workspace-grid">
        <EditorPane
          scenario={scenario}
          selectedTaskId={selectedTaskId}
          onAddLane={addLane}
          onAddTaskForLane={addTaskForLane}
          onCommitScenario={commitScenario}
          onDeleteLane={deleteLane}
          onDeleteTask={deleteTask}
          onDuplicateTask={duplicateTaskById}
          onSelectTask={setSelectedTaskId}
          onUpdateLane={updateLane}
          onUpdateTask={updateTask}
        />
        <AnalysisPane
          analysis={analysis}
          analysisView={analysisView}
          deadlineDay={scenario.deadlineDay}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onSetAnalysisView={setAnalysisView}
        />
        <InspectorPane analysis={analysis} taskExplanation={taskExplanation} />
      </div>
    </div>
  );
}
