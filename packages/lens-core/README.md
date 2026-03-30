# `lens-core`

`lens-core` is the boring shared chassis for the lens-style tools in this repo. It exists to hold small pieces of browser infrastructure that are genuinely cross-cutting and low-semantic.

## What belongs here

- Local persistence helpers for saving and loading scenario state
- JSON import/export helpers, including simple scenario-envelope unwrapping
- Download helpers for JSON and Markdown exports
- Minimal shell primitives and wrapper components such as `LensShell`, `LensHero`, `LensPanel`, and `LensStatGrid`
- Demo-scenario contract types that multiple apps can share without forcing the same scenario model

## What explicitly does not belong here

- Scoring, ranking, Pareto, dominance, or sensitivity semantics
- Scheduling, capacity, critical-path, slip-impact, or dependency semantics
- Evidence aggregation, verdict, contradiction, or certainty semantics
- A generic engine layer, schema DSL, or formula language
- UI abstractions that erase meaningful product differences between apps

## Why engines remain app-local

The apps share shape, but not reasoning:

- `TradeoffLens` evaluates options under weights, constraints, and frontier analysis
- `Threadline` reasons about dependencies, lane capacity, uncertainty, and schedule pressure
- `EvidenceLedger` reasons about claims, stance, source diversity, and contested evidence

Those engines are inspectable because they stay close to their product semantics. Extracting them too early would create a tidier package boundary at the cost of blurrier ownership and weaker truth.

## Acceptable extractions

- A helper that loads local state from `localStorage` with empty/fallback behavior
- A helper that reads JSON from a file input and unwraps `{ scenario: ... }`
- A simple shell wrapper that standardizes a shared page frame class

## Bad abstractions

- A generic “analysis engine” interface that hides what each app is actually computing
- A shared “criterion/task/claim” super-model that only works by becoming vague
- A meta-framework for panes, formulas, or rule execution before the common semantics are real
