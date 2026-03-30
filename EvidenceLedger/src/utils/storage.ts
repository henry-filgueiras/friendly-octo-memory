import { createEmptyScenario, syncScenario } from "../domain/helpers";
import type { EvidenceScenario } from "../domain/types";
import { loadLocalScenario, saveLocalScenario } from "lens-core";

const STORAGE_KEY = "friendly-octo-memory:evidence-ledger";

export function loadScenario(): EvidenceScenario {
  return loadLocalScenario({
    createEmpty: createEmptyScenario,
    storageKey: STORAGE_KEY,
    sync: syncScenario,
  });
}

export function saveScenario(scenario: EvidenceScenario): void {
  saveLocalScenario(STORAGE_KEY, scenario);
}
