import { createEmptyScenario, syncScenario } from "../domain/helpers";
import type { DecisionScenario } from "../domain/types";
import { loadLocalScenario, saveLocalScenario } from "lens-core";

const STORAGE_KEY = "tradeoff-lens.scenario.v1";

export function loadScenario(): DecisionScenario {
  return loadLocalScenario({
    createEmpty: createEmptyScenario,
    storageKey: STORAGE_KEY,
    sync: syncScenario,
  });
}

export function saveScenario(scenario: DecisionScenario): void {
  saveLocalScenario(STORAGE_KEY, scenario);
}
