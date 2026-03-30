export interface GuidedDemoStep {
  analysisTab: "ranked" | "excluded" | "pairwise" | "frontier";
  body: string;
  candidateName: string | null;
  title: string;
  xCriterionName?: string;
  yCriterionName?: string;
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
          <p className="section-label">Guided demo</p>
          <strong>
            Step {stepIndex + 1} of {totalSteps}
          </strong>
        </div>
        <button type="button" className="button button-ghost" onClick={onClose}>
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
          className="button button-ghost"
          onClick={onPrevious}
          disabled={isFirstStep}
        >
          Back
        </button>
        <button type="button" className="button button-secondary" onClick={onNext}>
          {isLastStep ? "Finish" : "Next"}
        </button>
      </div>
    </aside>
  );
}
