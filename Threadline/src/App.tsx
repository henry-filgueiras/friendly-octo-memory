import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AnalysisPane } from "./components/AnalysisPane";
import { EditorPane } from "./components/EditorPane";
import { GuidedDemoOverlay, type GuidedDemoStep } from "./components/GuidedDemoOverlay";
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
const GUIDED_DEMO_ID = "demo-launch";
const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  {
    analysisView: "timeline",
    focusTaskId: "qa",
    title: "The timeline shows when the finish line really gets set.",
    body:
      "This view is not just dependency order. It also reflects lane capacity, so a task can be dependency-ready and still wait in line. The beta dry run is a good example of work that quietly steers the ship date.",
  },
  {
    analysisView: "diagnostics",
    focusTaskId: "billing",
    title: "Diagnostics turn schedule pressure into explicit signals.",
    body:
      "Here the planner surfaces bottlenecks, lane queueing, and one-day slip impact. The point is not to predict perfectly. The point is to show where pressure compounds if a task drifts.",
  },
  {
    analysisView: "dependencies",
    focusTaskId: "brief",
    title: "The dependency map exposes the shape of the work.",
    body:
      "When plans feel hard, it is usually because the structure is hidden. This map shows which tasks are doing the real enabling and where the plan converges before launch.",
  },
  {
    analysisView: "scenarios",
    focusTaskId: "ship",
    title: "Scenario mode keeps uncertainty visible instead of pretending it is gone.",
    body:
      "Optimistic, expected, and conservative modes widen task durations based on confidence. If the finish moves too easily, that is a sign to revisit scope or capacity rather than trust the date blindly.",
  },
];

export default function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const analysisPaneRef = useRef<HTMLElement | null>(null);
  const [guidedDemoStepIndex, setGuidedDemoStepIndex] = useState<number | null>(null);
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
  const guidedDemoStep =
    guidedDemoStepIndex !== null ? GUIDED_DEMO_STEPS[guidedDemoStepIndex] : null;

  useEffect(() => {
    if (!guidedDemoStep) {
      return;
    }

    setAnalysisView(guidedDemoStep.analysisView);

    if (
      guidedDemoStep.focusTaskId &&
      scenario.tasks.some((task) => task.id === guidedDemoStep.focusTaskId)
    ) {
      setSelectedTaskId(guidedDemoStep.focusTaskId);
    }
  }, [guidedDemoStep, scenario.tasks, setAnalysisView, setSelectedTaskId]);

  useEffect(() => {
    if (!guidedDemoStep || !analysisPaneRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      analysisPaneRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [guidedDemoStep]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ThreadlineScenario | { scenario: ThreadlineScenario };
      replaceScenario(syncScenario("scenario" in parsed ? parsed.scenario : parsed));
      setGuidedDemoStepIndex(null);
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
    setGuidedDemoStepIndex(null);
  }

  function handleStartGuidedDemo() {
    const demo = DEMOS.find((entry) => entry.id === GUIDED_DEMO_ID);

    if (!demo) {
      return;
    }

    loadDemoScenario(demo.scenario);
    setGuidedDemoStepIndex(0);
  }

  function handleAdvanceGuidedDemo() {
    if (guidedDemoStepIndex === null) {
      return;
    }

    if (guidedDemoStepIndex >= GUIDED_DEMO_STEPS.length - 1) {
      setGuidedDemoStepIndex(null);
      return;
    }

    setGuidedDemoStepIndex(guidedDemoStepIndex + 1);
  }

  function handleRewindGuidedDemo() {
    if (guidedDemoStepIndex === null) {
      return;
    }

    setGuidedDemoStepIndex(Math.max(0, guidedDemoStepIndex - 1));
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
        onStartGuidedDemo={handleStartGuidedDemo}
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
          isGuidedDemoFocused={Boolean(guidedDemoStep)}
          paneRef={analysisPaneRef}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onSetAnalysisView={setAnalysisView}
        />
        <InspectorPane analysis={analysis} taskExplanation={taskExplanation} />
      </div>
      {guidedDemoStep ? (
        <GuidedDemoOverlay
          currentStep={guidedDemoStep}
          isFirstStep={guidedDemoStepIndex === 0}
          isLastStep={guidedDemoStepIndex === GUIDED_DEMO_STEPS.length - 1}
          stepIndex={guidedDemoStepIndex ?? 0}
          totalSteps={GUIDED_DEMO_STEPS.length}
          onClose={() => setGuidedDemoStepIndex(null)}
          onNext={handleAdvanceGuidedDemo}
          onPrevious={handleRewindGuidedDemo}
        />
      ) : null}
    </div>
  );
}
