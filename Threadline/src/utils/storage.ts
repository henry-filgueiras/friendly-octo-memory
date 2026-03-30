import { createEmptyScenario, syncScenario } from "../domain/helpers";
import type { ThreadlineScenario } from "../domain/types";

const STORAGE_KEY = "threadline.scenario.v1";

export function loadScenario(): ThreadlineScenario {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createEmptyScenario();
    }

    const parsed = JSON.parse(raw) as ThreadlineScenario | { scenario: ThreadlineScenario };
    const scenario = "scenario" in parsed ? parsed.scenario : parsed;
    return syncScenario(scenario);
  } catch {
    return createEmptyScenario();
  }
}

export function saveScenario(scenario: ThreadlineScenario): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
}
