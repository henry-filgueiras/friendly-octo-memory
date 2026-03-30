# Tradeoff Lens

Tradeoff Lens is a local-only browser tool for comparing options under explicit criteria, weights, and hard constraints. It runs entirely client-side with no backend, no accounts, no analytics, and no network dependency for the app itself after it loads.

## What it does

- Add, rename, duplicate, and delete candidate options
- Add numeric, boolean, enum, and freeform note criteria
- Mark criteria as hard constraints and exclude candidates with explicit reasons
- Compute deterministic weighted rankings with normalized numeric scoring
- Show ranked candidates, excluded candidates, pairwise comparisons, dominance flags, and a Pareto frontier
- Explain why a candidate ranked where it did and what would most likely need to change to overtake the leader
- Persist the current scenario in `localStorage`
- Import and export scenarios as JSON
- Export an analysis summary as Markdown
- Include built-in demo scenarios for cars, projects, TV shows, and engineering tools

## Run locally

### Dev mode

```bash
cd /Users/henry/friendly-octo-memory/TradeoffLens
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, typically `http://localhost:5173`.

If you want a repo-root shortcut instead of remembering the folder change:

```bash
cd /Users/henry/friendly-octo-memory
make tradeoff-lens-dev
```

### Built app

To produce the production bundle:

```bash
cd /Users/henry/friendly-octo-memory/TradeoffLens
npm run build
```

This writes the compiled app to [`dist/`](/Users/henry/friendly-octo-memory/TradeoffLens/dist).

To preview the built app locally:

```bash
cd /Users/henry/friendly-octo-memory/TradeoffLens
npm run preview -- --host 0.0.0.0
```

Or from the repo root:

```bash
cd /Users/henry/friendly-octo-memory
make tradeoff-lens-preview
```

### Important note

Do not serve the source folder with a plain static server like `python3 -m http.server` and then open `TradeoffLens/index.html`. The source app references [`src/main.tsx`](/Users/henry/friendly-octo-memory/TradeoffLens/src/main.tsx), which must be transformed by Vite in dev mode or compiled into `dist/` first.

## Test

```bash
cd /Users/henry/friendly-octo-memory/TradeoffLens
npm test
```

## Project structure

- [`index.html`](/Users/henry/friendly-octo-memory/TradeoffLens/index.html): Vite entry HTML
- [`src/App.tsx`](/Users/henry/friendly-octo-memory/TradeoffLens/src/App.tsx): main React UI and layout
- [`src/domain/scoring.ts`](/Users/henry/friendly-octo-memory/TradeoffLens/src/domain/scoring.ts): normalization, scoring, exclusion, dominance, pairwise, Pareto
- [`src/domain/explanations.ts`](/Users/henry/friendly-octo-memory/TradeoffLens/src/domain/explanations.ts): plain-English reasoning
- [`src/data/demos.ts`](/Users/henry/friendly-octo-memory/TradeoffLens/src/data/demos.ts): built-in demo scenarios
- [`src/utils/storage.ts`](/Users/henry/friendly-octo-memory/TradeoffLens/src/utils/storage.ts): local persistence
- [`tests/scoring.test.ts`](/Users/henry/friendly-octo-memory/TradeoffLens/tests/scoring.test.ts): unit tests for core scoring behavior
- [`/Users/henry/friendly-octo-memory/Makefile`](/Users/henry/friendly-octo-memory/Makefile): repo-root shortcuts for install, dev, build, and preview

## Scoring math

### 1. Hard constraints first

Candidates that fail any enabled hard constraint are excluded before weighted ranking starts. Exclusion reasons are stored and shown directly in the UI.

### 2. Numeric normalization

Each numeric criterion is normalized across the non-excluded candidates so mixed scales can be compared:

- maximize: `(value - min) / (max - min)`
- minimize: `(max - value) / (max - min)`

If all non-excluded candidates share the same numeric value for a criterion, they all receive a normalized score of `1` for that criterion. This keeps the ranking deterministic without inventing a fake spread.

### 3. Weighted score

For each scored criterion:

- utility is on a `0..1` scale
- weighted points = `utility * weight`
- total score = `(sum of weighted points / sum of active weights) * 100`

Boolean criteria score `1` when they match the preferred direction and `0` otherwise. Enum criteria use their explicit per-option `0..100` scores, converted to `0..1`.

### 4. Dominance

Candidate A dominates candidate B when A is equal or better on every scored criterion and strictly better on at least one.

## Limitations of weighted ranking systems

- Weighted models are only as good as the criteria you choose. If an important factor is missing, the ranking can still look precise while being incomplete.
- Normalization is relative to the current candidate set. Adding or removing a candidate can change everyone else's numeric scores.
- Weights imply tradeability. Real decisions sometimes contain values that should not be traded off smoothly, which is why hard constraints matter.
- Enum scoring is explicit but still subjective. A bad option scale can make a crisp UI hide a fuzzy judgment.
- Sensitivity analysis can show instability, but it does not eliminate ambiguity. If tiny weight changes flip the winner, that is a signal to revisit the model rather than trust the top row blindly.
