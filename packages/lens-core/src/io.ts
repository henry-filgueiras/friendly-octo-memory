export { unwrapScenarioEnvelope } from "./scenario";

export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportScenarioJson<TScenario>(filename: string, scenario: TScenario): void {
  downloadText(filename, JSON.stringify(scenario, null, 2), "application/json");
}

export async function readJsonFile<TValue>(file: File): Promise<TValue> {
  const text = await file.text();
  return JSON.parse(text) as TValue;
}
