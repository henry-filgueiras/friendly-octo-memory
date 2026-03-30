# `lens-core` Boundary

`lens-core` is the shared chassis for the lens-style tools in this repo. It exists to hold the browser plumbing and shell pieces that are genuinely boring, stable, and cross-cutting.

## What belongs here

- Local persistence helpers for loading and saving scenario state in the browser
- JSON import/export helpers, including simple scenario-envelope handling
- Download helpers for Markdown or JSON exports
- Minimal shell primitives and wrapper components such as `LensShell`, `LensHero`, `LensPanel`, and `LensStatGrid`
- Demo-scenario contract types that multiple apps can share without changing their actual scenario models

## What does not belong here

- Scoring, ranking, scheduling, frontier, or evidence-verdict logic
- Generic analysis kernels or a cross-tool execution engine
- A schema DSL, formula language, or configurable rule system
- Tool-specific explanation logic that depends on domain meaning rather than shared browser mechanics
- Premature pane abstractions that force different apps into the same UI semantics

## Why engine semantics stay app-local for now

The apps rhyme structurally, but their engines do different kinds of reasoning:

- `TradeoffLens` compares options under weights, constraints, dominance, and frontier analysis
- `Threadline` computes schedule pressure from dependencies, lane capacity, uncertainty, and slip impact
- `EvidenceLedger` reasons about source diversity, stance aggregation, and contested claims

Those systems share shape, but not meaning. Extracting them now would blur important domain boundaries and create an abstraction that looks tidy while hiding real differences. The current rule is simple: if a piece of code carries domain semantics, it stays with the app that owns those semantics.
