interface LoadLocalScenarioOptions<TScenario> {
  createEmpty: () => TScenario;
  storageKey: string;
  sync: (scenario: TScenario) => TScenario;
}

import type { LensScenarioEnvelope } from "./scenario";
import { unwrapScenarioEnvelope } from "./scenario";

export function loadLocalScenario<TScenario>({
  createEmpty,
  storageKey,
  sync,
}: LoadLocalScenarioOptions<TScenario>): TScenario {
  if (typeof window === "undefined") {
    return createEmpty();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return createEmpty();
    }

    return sync(unwrapScenarioEnvelope(JSON.parse(raw) as LensScenarioEnvelope<TScenario>));
  } catch {
    return createEmpty();
  }
}

export function saveLocalScenario<TScenario>(storageKey: string, scenario: TScenario): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(scenario));
}
