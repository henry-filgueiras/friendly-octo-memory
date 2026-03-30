import { createCandidate, createId, createScenarioFromSeed } from "../domain/helpers";
import type { DecisionScenario, EnumOption } from "../domain/types";
import type { LensDemoScenario } from "lens-core";

function enumOptions(labelsAndScores: Array<[string, number]>): EnumOption[] {
  return labelsAndScores.map(([label, score]) => ({
    id: createId("option"),
    label,
    score,
  }));
}

function enumValueId(options: EnumOption[], label: string): string {
  const option = options.find((entry) => entry.label === label);

  if (!option) {
    throw new Error(`Missing enum option for label "${label}"`);
  }

  return option.id;
}

export function buildDemoScenarios(): LensDemoScenario<DecisionScenario>[] {
  const carRange = createCandidate("Honda CR-V Hybrid");
  carRange.notes = "Solid all-rounder with practical cargo space.";
  const carEv = createCandidate("Tesla Model 3");
  carEv.notes = "Fast and efficient, but not ideal if home charging is tricky.";
  const carWagon = createCandidate("Subaru Outback");
  carWagon.notes = "Great for weather and long drives, weaker on efficiency.";
  const carCompact = createCandidate("Mazda CX-5");
  carCompact.notes = "Comfortable and polished, but relatively thirsty.";

  const carPriceId = createId("criterion");
  const carEfficiencyId = createId("criterion");
  const carSafetyId = createId("criterion");
  const carAwdId = createId("criterion");
  const carServiceId = createId("criterion");
  const carUseId = createId("criterion");
  const carSafetyOptions = enumOptions([
    ["Fair", 35],
    ["Good", 70],
    ["Excellent", 100],
  ]);
  const carServiceOptions = enumOptions([
    ["Weak", 25],
    ["Mixed", 55],
    ["Strong", 90],
  ]);

  [carRange, carEv, carWagon, carCompact].forEach((candidate) => {
    candidate.values[carUseId] = "";
  });

  carRange.values[carPriceId] = 39000;
  carRange.values[carEfficiencyId] = 38;
  carRange.values[carSafetyId] = enumValueId(carSafetyOptions, "Excellent");
  carRange.values[carAwdId] = true;
  carRange.values[carServiceId] = enumValueId(carServiceOptions, "Strong");
  carRange.values[carUseId] = "Great if you want one car to handle commuting and weekend trips.";

  carEv.values[carPriceId] = 42990;
  carEv.values[carEfficiencyId] = 134;
  carEv.values[carSafetyId] = enumValueId(carSafetyOptions, "Excellent");
  carEv.values[carAwdId] = false;
  carEv.values[carServiceId] = enumValueId(carServiceOptions, "Mixed");
  carEv.values[carUseId] = "Best if charging access is easy and low running cost matters.";

  carWagon.values[carPriceId] = 36500;
  carWagon.values[carEfficiencyId] = 29;
  carWagon.values[carSafetyId] = enumValueId(carSafetyOptions, "Good");
  carWagon.values[carAwdId] = true;
  carWagon.values[carServiceId] = enumValueId(carServiceOptions, "Strong");
  carWagon.values[carUseId] = "Best for rough weather, road trips, and outdoor gear.";

  carCompact.values[carPriceId] = 35200;
  carCompact.values[carEfficiencyId] = 28;
  carCompact.values[carSafetyId] = enumValueId(carSafetyOptions, "Good");
  carCompact.values[carAwdId] = false;
  carCompact.values[carServiceId] = enumValueId(carServiceOptions, "Strong");
  carCompact.values[carUseId] = "Feels premium for the price, but less adaptable.";

  const projectAssistant = createCandidate("Customer feedback map");
  projectAssistant.notes = "Turns recurring support requests into a live issue map.";
  const projectOnboarding = createCandidate("Onboarding overhaul");
  projectOnboarding.notes = "Improves activation and reduces support burden.";
  const projectInternal = createCandidate("Internal admin redesign");
  projectInternal.notes = "Makes ops work smoother but is mostly internal value.";
  const projectSearch = createCandidate("Semantic search pilot");
  projectSearch.notes = "High upside but needs technical spike work.";

  const projectImpactId = createId("criterion");
  const projectEffortId = createId("criterion");
  const projectSponsorId = createId("criterion");
  const projectStrategicId = createId("criterion");
  const projectRiskId = createId("criterion");
  const projectStrategicOptions = enumOptions([
    ["Fair", 40],
    ["Strong", 78],
    ["Excellent", 100],
  ]);

  projectAssistant.values[projectImpactId] = 70;
  projectAssistant.values[projectEffortId] = 30;
  projectAssistant.values[projectSponsorId] = true;
  projectAssistant.values[projectStrategicId] = enumValueId(projectStrategicOptions, "Strong");
  projectAssistant.values[projectRiskId] = 25;

  projectOnboarding.values[projectImpactId] = 82;
  projectOnboarding.values[projectEffortId] = 45;
  projectOnboarding.values[projectSponsorId] = true;
  projectOnboarding.values[projectStrategicId] = enumValueId(projectStrategicOptions, "Excellent");
  projectOnboarding.values[projectRiskId] = 20;

  projectInternal.values[projectImpactId] = 48;
  projectInternal.values[projectEffortId] = 25;
  projectInternal.values[projectSponsorId] = false;
  projectInternal.values[projectStrategicId] = enumValueId(projectStrategicOptions, "Fair");
  projectInternal.values[projectRiskId] = 12;

  projectSearch.values[projectImpactId] = 88;
  projectSearch.values[projectEffortId] = 70;
  projectSearch.values[projectSponsorId] = true;
  projectSearch.values[projectStrategicId] = enumValueId(projectStrategicOptions, "Strong");
  projectSearch.values[projectRiskId] = 55;

  const showBear = createCandidate("The Bear");
  const showSeverance = createCandidate("Severance");
  const showAndor = createCandidate("Andor");
  const showDetectorists = createCandidate("Detectorists");

  const showRatingId = createId("criterion");
  const showCommitmentId = createId("criterion");
  const showFinishedId = createId("criterion");
  const showMoodId = createId("criterion");
  const showRewatchId = createId("criterion");
  const showMoodOptions = enumOptions([
    ["Gentle", 95],
    ["Focused", 88],
    ["Mind-bending", 80],
    ["Intense", 68],
  ]);

  showBear.values[showRatingId] = 95;
  showBear.values[showCommitmentId] = 3;
  showBear.values[showFinishedId] = false;
  showBear.values[showMoodId] = enumValueId(showMoodOptions, "Intense");
  showBear.values[showRewatchId] = 70;

  showSeverance.values[showRatingId] = 94;
  showSeverance.values[showCommitmentId] = 2;
  showSeverance.values[showFinishedId] = false;
  showSeverance.values[showMoodId] = enumValueId(showMoodOptions, "Mind-bending");
  showSeverance.values[showRewatchId] = 90;

  showAndor.values[showRatingId] = 92;
  showAndor.values[showCommitmentId] = 2;
  showAndor.values[showFinishedId] = true;
  showAndor.values[showMoodId] = enumValueId(showMoodOptions, "Focused");
  showAndor.values[showRewatchId] = 85;

  showDetectorists.values[showRatingId] = 88;
  showDetectorists.values[showCommitmentId] = 3;
  showDetectorists.values[showFinishedId] = true;
  showDetectorists.values[showMoodId] = enumValueId(showMoodOptions, "Gentle");
  showDetectorists.values[showRewatchId] = 80;

  const toolCursor = createCandidate("Cursor");
  const toolVSCode = createCandidate("VS Code");
  const toolZed = createCandidate("Zed");
  const toolJetBrains = createCandidate("JetBrains IDE");

  const toolCostId = createId("criterion");
  const toolSpeedId = createId("criterion");
  const toolExtensibilityId = createId("criterion");
  const toolOfflineId = createId("criterion");
  const toolTeamFitId = createId("criterion");
  const toolExtensibilityOptions = enumOptions([
    ["Fair", 45],
    ["Strong", 78],
    ["Excellent", 100],
  ]);

  toolCursor.values[toolCostId] = 20;
  toolCursor.values[toolSpeedId] = 82;
  toolCursor.values[toolExtensibilityId] = enumValueId(toolExtensibilityOptions, "Strong");
  toolCursor.values[toolOfflineId] = false;
  toolCursor.values[toolTeamFitId] = 78;

  toolVSCode.values[toolCostId] = 0;
  toolVSCode.values[toolSpeedId] = 74;
  toolVSCode.values[toolExtensibilityId] = enumValueId(toolExtensibilityOptions, "Excellent");
  toolVSCode.values[toolOfflineId] = true;
  toolVSCode.values[toolTeamFitId] = 88;

  toolZed.values[toolCostId] = 0;
  toolZed.values[toolSpeedId] = 94;
  toolZed.values[toolExtensibilityId] = enumValueId(toolExtensibilityOptions, "Fair");
  toolZed.values[toolOfflineId] = true;
  toolZed.values[toolTeamFitId] = 68;

  toolJetBrains.values[toolCostId] = 19;
  toolJetBrains.values[toolSpeedId] = 70;
  toolJetBrains.values[toolExtensibilityId] = enumValueId(toolExtensibilityOptions, "Strong");
  toolJetBrains.values[toolOfflineId] = true;
  toolJetBrains.values[toolTeamFitId] = 84;

  const scenarios = [
    createScenarioFromSeed({
      name: "Choosing a car",
      description:
        "Balance purchase cost, long-term efficiency, service reality, and must-have requirements.",
      candidates: [carRange, carEv, carWagon, carCompact],
      criteria: [
        {
          id: carPriceId,
          name: "Purchase price",
          type: "numeric",
          weight: 28,
          direction: "minimize",
          constraintEnabled: true,
          minConstraint: null,
          maxConstraint: 45000,
        },
        {
          id: carEfficiencyId,
          name: "Efficiency",
          type: "numeric",
          weight: 24,
          direction: "maximize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
        {
          id: carSafetyId,
          name: "Safety package",
          type: "enum",
          weight: 22,
          constraintEnabled: true,
          options: carSafetyOptions,
          allowedValues: [
            enumValueId(carSafetyOptions, "Good"),
            enumValueId(carSafetyOptions, "Excellent"),
          ],
        },
        {
          id: carAwdId,
          name: "AWD",
          type: "boolean",
          weight: 14,
          direction: "maximize",
          constraintEnabled: false,
          requiredValue: true,
        },
        {
          id: carServiceId,
          name: "Service network",
          type: "enum",
          weight: 12,
          constraintEnabled: false,
          options: carServiceOptions,
          allowedValues: [],
        },
        {
          id: carUseId,
          name: "Best-fit notes",
          type: "note",
          weight: 0,
          constraintEnabled: false,
        },
      ],
    }),
    createScenarioFromSeed({
      name: "Picking a project",
      description:
        "Pick the next project with the best mix of impact, sponsor support, and achievable effort.",
      candidates: [projectAssistant, projectOnboarding, projectInternal, projectSearch],
      criteria: [
        {
          id: projectImpactId,
          name: "Customer impact",
          type: "numeric",
          weight: 34,
          direction: "maximize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
        {
          id: projectEffortId,
          name: "Implementation effort",
          type: "numeric",
          weight: 21,
          direction: "minimize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
        {
          id: projectSponsorId,
          name: "Executive sponsor",
          type: "boolean",
          weight: 18,
          direction: "maximize",
          constraintEnabled: true,
          requiredValue: true,
        },
        {
          id: projectStrategicId,
          name: "Strategic fit",
          type: "enum",
          weight: 17,
          constraintEnabled: false,
          options: projectStrategicOptions,
          allowedValues: [],
        },
        {
          id: projectRiskId,
          name: "Delivery risk",
          type: "numeric",
          weight: 10,
          direction: "minimize",
          constraintEnabled: true,
          minConstraint: null,
          maxConstraint: 60,
        },
      ],
    }),
    createScenarioFromSeed({
      name: "Selecting a TV show",
      description:
        "Choose something watchable now without pretending every show is the same kind of commitment.",
      candidates: [showBear, showSeverance, showAndor, showDetectorists],
      criteria: [
        {
          id: showRatingId,
          name: "Critical rating",
          type: "numeric",
          weight: 34,
          direction: "maximize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
        {
          id: showCommitmentId,
          name: "Season commitment",
          type: "numeric",
          weight: 24,
          direction: "minimize",
          constraintEnabled: true,
          minConstraint: null,
          maxConstraint: 3,
        },
        {
          id: showFinishedId,
          name: "Fully released",
          type: "boolean",
          weight: 20,
          direction: "maximize",
          constraintEnabled: true,
          requiredValue: true,
        },
        {
          id: showMoodId,
          name: "Mood match",
          type: "enum",
          weight: 14,
          constraintEnabled: false,
          options: showMoodOptions,
          allowedValues: [],
        },
        {
          id: showRewatchId,
          name: "Rewatchability",
          type: "numeric",
          weight: 8,
          direction: "maximize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
      ],
    }),
    createScenarioFromSeed({
      name: "Comparing engineering tools",
      description:
        "Compare engineering tools on cost, speed, extensibility, and fit for a local-first workflow.",
      candidates: [toolCursor, toolVSCode, toolZed, toolJetBrains],
      criteria: [
        {
          id: toolCostId,
          name: "Monthly cost",
          type: "numeric",
          weight: 28,
          direction: "minimize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
        {
          id: toolSpeedId,
          name: "Editing speed",
          type: "numeric",
          weight: 27,
          direction: "maximize",
          constraintEnabled: false,
          minConstraint: null,
          maxConstraint: null,
        },
        {
          id: toolExtensibilityId,
          name: "Extensibility",
          type: "enum",
          weight: 20,
          constraintEnabled: false,
          options: toolExtensibilityOptions,
          allowedValues: [],
        },
        {
          id: toolOfflineId,
          name: "Works well offline",
          type: "boolean",
          weight: 10,
          direction: "maximize",
          constraintEnabled: false,
          requiredValue: true,
        },
        {
          id: toolTeamFitId,
          name: "Team adoption fit",
          type: "numeric",
          weight: 15,
          direction: "maximize",
          constraintEnabled: true,
          minConstraint: 70,
          maxConstraint: null,
        },
      ],
    }),
  ];

  return scenarios.map((scenario) => ({
    id: scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    label: scenario.name,
    description: scenario.description,
    scenario,
  }));
}
