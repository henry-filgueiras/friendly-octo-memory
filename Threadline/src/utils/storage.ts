import { createEmptyScenario, syncScenario } from "../domain/helpers";
import type { ThreadlineScenario } from "../domain/types";
import { loadLocalScenario, saveLocalScenario } from "lens-core";

const STORAGE_KEY = "threadline.scenario.v1";

export function loadScenario(): ThreadlineScenario {
  return loadLocalScenario({
    createEmpty: createEmptyScenario,
    storageKey: STORAGE_KEY,
    sync: syncScenario,
  });
}

export function saveScenario(scenario: ThreadlineScenario): void {
  saveLocalScenario(STORAGE_KEY, scenario);
}
