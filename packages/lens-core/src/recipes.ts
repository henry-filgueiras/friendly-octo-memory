import type { LensArtifactKind } from "./artifacts";

export interface LensRecipeStepHint {
  note?: string;
  reviewHint?: string;
}

export interface LensRecipe {
  id: string;
  label: string;
  startKind: LensArtifactKind;
  targetKind: LensArtifactKind;
  transformIds: string[];
  stepHints?: LensRecipeStepHint[];
}

export const lensRecipes: ReadonlyArray<LensRecipe> = [
  {
    id: "threadline-plan-pressure-to-evidence-map",
    label: "Plan pressure to evidence seed",
    startKind: "ExecutionPlan",
    targetKind: "EvidenceMap",
    transformIds: ["execution-plan-to-claim-set", "claim-set-to-evidence-map-seed"],
    stepHints: [
      {
        note: "Project only the planning-pressure slice into claims.",
        reviewHint: "Check that the resulting claims feel like challengeable statements, not a task dump.",
      },
      {
        note: "Seed the evidence map without inventing sources or verdicts.",
        reviewHint: "The output should contain claims only. Sources and links stay empty until a human adds them.",
      },
    ],
  },
];

export function getLensRecipe(recipeId: string): LensRecipe | undefined {
  return lensRecipes.find((recipe) => recipe.id === recipeId);
}
