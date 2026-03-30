import { createEmptyScenario, syncScenario } from "../domain/helpers";
import type { DecisionScenario } from "../domain/types";

const STORAGE_KEY = "tradeoff-lens.scenario.v1";

export function loadScenario(): DecisionScenario {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createEmptyScenario();
    }

    const parsed = JSON.parse(raw) as DecisionScenario | { scenario: DecisionScenario };
    const scenario = "scenario" in parsed ? parsed.scenario : parsed;
    return syncScenario(scenario);
  } catch {
    return createEmptyScenario();
  }
}

export function saveScenario(scenario: DecisionScenario): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
}
