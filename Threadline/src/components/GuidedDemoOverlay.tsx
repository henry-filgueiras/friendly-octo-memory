import type { AnalysisView } from "./AnalysisPane";

export interface GuidedDemoStep {
  analysisView: AnalysisView;
  body: string;
  focusTaskId: string | null;
  title: string;
}

interface GuidedDemoOverlayProps {
  currentStep: GuidedDemoStep;
  isFirstStep: boolean;
  isLastStep: boolean;
  stepIndex: number;
  totalSteps: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export function GuidedDemoOverlay({
  currentStep,
  isFirstStep,
  isLastStep,
  stepIndex,
  totalSteps,
  onClose,
  onNext,
  onPrevious,
}: GuidedDemoOverlayProps) {
  return (
    <aside className="guided-demo" aria-live="polite">
      <div className="guided-demo__header">
        <div>
          <p className="eyebrow">Guided demo</p>
          <strong>
            Step {stepIndex + 1} of {totalSteps}
          </strong>
        </div>
        <button type="button" className="ghost-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="guided-demo__body">
        <h3>{currentStep.title}</h3>
        <p>{currentStep.body}</p>
      </div>
      <div className="guided-demo__footer">
        <button
          type="button"
          className="ghost-button"
          onClick={onPrevious}
          disabled={isFirstStep}
        >
          Back
        </button>
        <button type="button" className="tab-button tab-button--active" onClick={onNext}>
          {isLastStep ? "Finish" : "Next"}
        </button>
      </div>
    </aside>
  );
}
