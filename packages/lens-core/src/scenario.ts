export type LensScenarioEnvelope<TScenario> = TScenario | { scenario: TScenario };

export function unwrapScenarioEnvelope<TScenario>(
  parsed: LensScenarioEnvelope<TScenario>
): TScenario {
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
