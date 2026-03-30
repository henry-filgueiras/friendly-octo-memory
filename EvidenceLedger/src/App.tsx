import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AnalysisPane } from "./components/AnalysisPane";
import { EditorPane } from "./components/EditorPane";
import { GuidedDemoOverlay, type GuidedDemoStep } from "./components/GuidedDemoOverlay";
import { HeroPanel } from "./components/HeroPanel";
import { InspectorPane } from "./components/InspectorPane";
import { buildEvidenceMapArtifact } from "./domain/artifacts";
import { getDemoScenarios } from "./data/demos";
import { buildClaimExplanation } from "./domain/explanations";
import { isClaimSetArtifactEnvelope, seedScenarioFromClaimSetArtifact } from "./domain/imports";
import { syncScenario } from "./domain/helpers";
import { buildMarkdownSummary } from "./domain/markdown";
import type { EvidenceScenario } from "./domain/types";
import { useEvidenceScenarioState } from "./hooks/useEvidenceScenarioState";
import {
  downloadText,
  exportScenarioJson,
  readJsonFile,
  unwrapScenarioEnvelope,
} from "lens-core";
import type { LensArtifactEnvelope } from "lens-core";

const DEMOS = getDemoScenarios();
const GUIDED_DEMO_ID = "demo-incident";
const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  {
    analysisView: "claims",
    focusClaimId: "claim-db",
    title: "Start with the claims view to see where the ledger thinks the pressure is.",
    body:
      "Claims are ranked by importance and how much evidence pressure they are carrying. This turns a pile of notes into an ordered set of things worth debating.",
  },
  {
    analysisView: "contested",
    focusClaimId: "claim-deploy",
    title: "Contested claims are where the story is still fighting itself.",
    body:
      "A neat-looking incident narrative can still be wrong. This view pulls forward claims with real support on both sides, so disagreement is visible instead of buried.",
  },
  {
    analysisView: "gaps",
    focusClaimId: "claim-eu",
    title: "Gaps are the places where confidence is being faked by habit or momentum.",
    body:
      "Thin or open claims matter because people still act on them. Surfacing them early makes the next evidence-collection move much clearer.",
  },
  {
    analysisView: "matrix",
    focusClaimId: "claim-retries",
    title: "The matrix shows which sources are actually carrying each claim.",
    body:
      "This is the fast way to see single-source fragility, contradiction clusters, and whether a source is being overused across the story.",
  },
];

export default function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const analysisPaneRef = useRef<HTMLElement | null>(null);
  const [guidedDemoStepIndex, setGuidedDemoStepIndex] = useState<number | null>(null);
  const [sourceArtifact, setSourceArtifact] = useState<LensArtifactEnvelope | null>(null);
  const {
    analysis,
    analysisView,
    addClaim,
    addLink,
    addSource,
    deleteClaim,
    deleteLink,
    deleteSource,
    duplicateClaimById,
    loadDemoScenario,
    replaceScenario,
    scenario,
    selectedClaimId,
    setAnalysisView,
    setSelectedClaimId,
    updateClaim,
    updateLink,
    updateScenario,
    updateSource,
  } = useEvidenceScenarioState();
  const claimExplanation = buildClaimExplanation(analysis, selectedClaimId);
  const guidedDemoStep =
    guidedDemoStepIndex !== null ? GUIDED_DEMO_STEPS[guidedDemoStepIndex] : null;

  useEffect(() => {
    if (!guidedDemoStep) {
      return;
    }

    setAnalysisView(guidedDemoStep.analysisView);

    if (
      guidedDemoStep.focusClaimId &&
      scenario.claims.some((claim) => claim.id === guidedDemoStep.focusClaimId)
    ) {
      setSelectedClaimId(guidedDemoStep.focusClaimId);
    }
  }, [guidedDemoStep, scenario.claims, setAnalysisView, setSelectedClaimId]);

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
      const parsed = await readJsonFile<unknown>(file);

      if (isClaimSetArtifactEnvelope(parsed)) {
        replaceScenario(seedScenarioFromClaimSetArtifact(parsed));
        setSourceArtifact(parsed);
      } else {
        replaceScenario(
          syncScenario(
            unwrapScenarioEnvelope(parsed as EvidenceScenario | { scenario: EvidenceScenario })
          )
        );
        setSourceArtifact(null);
      }

      setGuidedDemoStepIndex(null);
    } catch {
      window.alert("Could not import that JSON file.");
    } finally {
      event.target.value = "";
    }
  }

  function exportJson() {
    exportScenarioJson("evidence-ledger.json", scenario);
  }

  function exportEvidenceMapArtifactJson() {
    exportScenarioJson(
      "evidence-ledger.evidence-map.artifact.json",
      buildEvidenceMapArtifact(scenario, sourceArtifact)
    );
  }

  function exportMarkdown() {
    downloadText(
      "evidence-ledger-summary.md",
      buildMarkdownSummary(scenario, analysis),
      "text/markdown"
    );
  }

  function handleLoadDemo(demoId: string) {
    loadDemoScenario(demoId);
    setSourceArtifact(null);
    setGuidedDemoStepIndex(null);
  }

  function handleStartGuidedDemo() {
    loadDemoScenario(GUIDED_DEMO_ID);
    setSourceArtifact(null);
    setGuidedDemoStepIndex(0);
  }

  const artifactSourceLabel = sourceArtifact
    ? `Current source artifact: ${sourceArtifact.kind} / ${sourceArtifact.title} from ${
        sourceArtifact.provenance.sourceScenario?.app ?? sourceArtifact.provenance.producedBy.app
      }.`
    : "Current source artifact: none. This ledger is currently being edited as a local scenario.";

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
    <div className="ledger-shell">
      <HeroPanel
        artifactSourceLabel={artifactSourceLabel}
        demos={DEMOS}
        importInputRef={importInputRef}
        onExportEvidenceMapArtifact={exportEvidenceMapArtifactJson}
        onExportJson={exportJson}
        onExportMarkdown={exportMarkdown}
        onImport={handleImport}
        onLoadDemo={handleLoadDemo}
        onStartGuidedDemo={handleStartGuidedDemo}
      />

      <div className="workspace-grid">
        <EditorPane
          scenario={scenario}
          selectedClaimId={selectedClaimId}
          onAddClaim={addClaim}
          onAddLink={addLink}
          onAddSource={addSource}
          onDeleteClaim={deleteClaim}
          onDeleteLink={deleteLink}
          onDeleteSource={deleteSource}
          onDuplicateClaim={duplicateClaimById}
          onSelectClaim={setSelectedClaimId}
          onUpdateClaim={updateClaim}
          onUpdateLink={updateLink}
          onUpdateScenario={updateScenario}
          onUpdateSource={updateSource}
        />
        <AnalysisPane
          analysis={analysis}
          analysisView={analysisView}
          isGuidedDemoFocused={Boolean(guidedDemoStep)}
          paneRef={analysisPaneRef}
          selectedClaimId={selectedClaimId}
          onSelectClaim={setSelectedClaimId}
          onSetAnalysisView={setAnalysisView}
        />
        <InspectorPane
          analysis={analysis}
          claimExplanation={claimExplanation}
          selectedClaimId={selectedClaimId}
        />
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
