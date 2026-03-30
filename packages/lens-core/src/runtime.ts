export interface LensAnalysisContext<TScenario, TAnalysis> {
  scenario: TScenario;
  analysis: TAnalysis;
}

export interface LensExplanationContext<TScenario, TAnalysis, TSelectionId> {
  scenario: TScenario;
  analysis: TAnalysis;
  selectedId: TSelectionId | null;
}

export interface LensRuntime<TScenario, TAnalysis, TSelectionId = string> {
  createEmptyScenario: () => TScenario;
  normalizeScenario: (scenario: TScenario) => TScenario;
  analyzeScenario: (scenario: TScenario) => TAnalysis;
  exportMarkdown: (context: LensAnalysisContext<TScenario, TAnalysis>) => string;
  explainSelection: (
    context: LensExplanationContext<TScenario, TAnalysis, TSelectionId>
  ) => string | null;
}
