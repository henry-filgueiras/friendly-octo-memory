import { createEmptyScenario, syncScenario } from "../domain/helpers";
import type { EvidenceScenario } from "../domain/types";

const STORAGE_KEY = "friendly-octo-memory:evidence-ledger";

export function loadScenario(): EvidenceScenario {
  if (typeof window === "undefined") {
    return createEmptyScenario();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createEmptyScenario();
  }

  try {
    return syncScenario(JSON.parse(raw) as EvidenceScenario);
  } catch {
    return createEmptyScenario();
  }
}

export function saveScenario(scenario: EvidenceScenario): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
}
