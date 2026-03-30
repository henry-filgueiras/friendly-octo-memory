# Lens Runtime Boundary

This document proposes the smallest useful shared runtime seam for the lens-style apps in this repo.

The goal is not to extract a generic engine. The goal is to name the lifecycle boundary between:

- app-local scenario and analysis semantics
- shared chassis code that loads, saves, frames, and lightly exercises those apps

## What the shared contract should cover

The shared contract should only describe the boring lifecycle seams that every lens-style app already has:

- create an empty local scenario
- normalize or sync a local scenario after loading/import
- run the app-local analysis engine
- export a Markdown summary from local scenario + local analysis
- explain the currently selected entity in plain language

These are integration seams, not semantic abstractions.

## What the shared contract should not cover

The contract should not try to unify:

- scoring or weighting logic
- scheduling or critical-path logic
- evidence aggregation or verdict logic
- a common scenario schema
- a common analysis schema
- pane-level UI protocols
- formulas, rule languages, or plugins

If a type starts to describe *what* an app believes rather than *when* the app is asked to do work, it is probably too abstract for `lens-core`.

## Proposed minimal interface

`lens-core` can expose a single typed interface:

- `LensRuntime<TScenario, TAnalysis, TSelectionId>`

It should provide only:

- `createEmptyScenario()`
- `normalizeScenario(scenario)`
- `analyzeScenario(scenario)`
- `exportMarkdown({ scenario, analysis })`
- `explainSelection({ scenario, analysis, selectedId })`

Importantly:

- `TScenario` remains app-local
- `TAnalysis` remains app-local
- `TSelectionId` remains app-local

That keeps the real meaning in the app while still letting shared chassis code understand the lifecycle.

## Why this is enough for now

This contract is useful because it matches the actual way the apps already behave:

- state is loaded from local storage or JSON
- the scenario gets normalized
- analysis runs deterministically
- the app can export a Markdown artifact
- the app can explain a selected object

That is a real coincidence across apps. The engines themselves are not.

## Acceptable uses

- a workbench that can host a toy runtime without knowing its domain semantics
- shared persistence helpers that ask the runtime for `createEmptyScenario` and `normalizeScenario`
- lightweight smoke wiring that proves a local app exposes the expected lifecycle

## Bad next steps

- building a generic kernel that all apps must compile into
- introducing a schema DSL to represent scenarios or analyses
- inventing a plugin system
- forcing common entity names like criterion/task/claim/item
- pretending that “analyze” means the same thing across the apps

## Current recommendation

Add the typed runtime interface to `lens-core`, prove it in the workbench, and stop there.

`TradeoffLens`, `Threadline`, and `EvidenceLedger` should keep owning their real engines locally until a future extraction is supported by repeated working code rather than optimism.
