import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import {
  LensHero,
  LensPanel,
  LensShell,
  LensStatGrid,
  exportScenarioJson,
  loadLocalScenario,
  saveLocalScenario,
  unwrapScenarioEnvelope,
} from "../src";

describe("lens-core", () => {
  it("unwraps plain and enveloped scenarios", () => {
    expect(unwrapScenarioEnvelope({ id: "plain" })).toEqual({ id: "plain" });
    expect(unwrapScenarioEnvelope({ scenario: { id: "wrapped" } })).toEqual({ id: "wrapped" });
  });

  it("loads and saves local scenarios through the shared helper", () => {
    const storage = new Map<string, string>();
    const windowStub = {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    };

    Object.assign(globalThis, { window: windowStub });

    saveLocalScenario("lens-core.test", { id: "saved" });

    const loaded = loadLocalScenario({
      createEmpty: () => ({ id: "empty" }),
      storageKey: "lens-core.test",
      sync: (scenario: { id: string }) => ({ ...scenario, synced: true }),
    });

    expect(loaded).toEqual({ id: "saved", synced: true });
  });

  it("falls back to the empty scenario when local storage is missing or invalid", () => {
    const windowStub = {
      localStorage: {
        getItem() {
          return "{not-valid-json";
        },
      },
    };

    Object.assign(globalThis, { window: windowStub });

    const loaded = loadLocalScenario({
      createEmpty: () => ({ id: "empty" }),
      storageKey: "lens-core.missing",
      sync: (scenario: { id: string }) => ({ ...scenario, synced: true }),
    });

    expect(loaded).toEqual({ id: "empty" });
  });

  it("exports boring shell wrappers that render predictable markup", () => {
    const html = renderToStaticMarkup(
      <LensShell>
        <LensHero>hero</LensHero>
        <LensPanel>panel</LensPanel>
        <LensStatGrid>stats</LensStatGrid>
      </LensShell>
    );

    expect(typeof LensShell).toBe("function");
    expect(html).toContain("lens-shell");
    expect(html).toContain("lens-hero");
    expect(html).toContain("lens-panel");
    expect(html).toContain("lens-stat-grid");
  });

  it("serializes scenarios for JSON export", () => {
    const downloads: Array<{ filename: string; href: string; downloaded: string | null }> = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalDocument = globalThis.document;

    Object.assign(globalThis, {
      document: {
        createElement() {
          return {
            href: "",
            download: "",
            click() {
              downloads.push({
                filename: this.download,
                href: this.href,
                downloaded: this.download,
              });
            },
          };
        },
      },
    });
    URL.createObjectURL = () => "blob:mock";
    URL.revokeObjectURL = () => {};

    exportScenarioJson("scenario.json", { id: "scenario" });

    expect(downloads[0]?.filename).toBe("scenario.json");
    expect(downloads[0]?.href).toBe("blob:mock");

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    Object.assign(globalThis, { document: originalDocument });
  });
});
