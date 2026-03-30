interface LoadLocalScenarioOptions<TScenario> {
  createEmpty: () => TScenario;
  storageKey: string;
  sync: (scenario: TScenario) => TScenario;
}

type Envelope<TScenario> = TScenario | { scenario: TScenario };

function unwrapStoredScenario<TScenario>(parsed: Envelope<TScenario>): TScenario {
  if (
    parsed &&
    typeof parsed === "object" &&
    "scenario" in parsed &&
    parsed.scenario !== undefined
  ) {
    return parsed.scenario;
  }

  return parsed as TScenario;
}

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

    return sync(unwrapStoredScenario(JSON.parse(raw) as Envelope<TScenario>));
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
