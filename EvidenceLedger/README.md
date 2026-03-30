# Evidence Ledger

Evidence Ledger is a local-only browser tool for pressure-testing claims against evidence. It helps you map support, contradiction, source reliability, and missing evidence without shipping any data to a backend or hiding the reasoning inside a black box.

## What it does

- Add claims with categories, notes, and importance
- Add sources with type, reliability, and notes
- Add explicit support, contradiction, or mention links between sources and claims
- Compute deterministic evidence points from source reliability, link strength, and link confidence
- Surface claims, contested claims, evidence gaps, and a source-vs-claim matrix
- Explain a selected claim in plain English, including what helped, what hurt, and what evidence is still missing
- Persist the current ledger in `localStorage`
- Import and export the scenario as JSON
- Export a Markdown summary
- Import `ClaimSet` artifacts to seed claims and export `EvidenceMap` artifacts for downstream handoff
- Include built-in demos for incident review, onboarding hypotheses, and vendor migration risk
- Include a guided walkthrough using the incident-review demo

## Run locally

### Dev mode

```bash
cd EvidenceLedger
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, typically `http://localhost:5173`.

If you want a repo-root shortcut instead:

```bash
make evidence-ledger-dev
```

### Built app

To produce the production bundle:

```bash
cd EvidenceLedger
npm run build
```

This writes the compiled app to [`dist/`](./dist).

To preview the built app locally:

```bash
cd EvidenceLedger
npm run preview -- --host 0.0.0.0
```

Or from the repo root:

```bash
make evidence-ledger-preview
```

### Important note

Do not serve the source folder directly with a plain static server. The app entry references [`src/main.tsx`](./src/main.tsx), which needs Vite in dev mode or a compiled `dist/` bundle.

## Test

```bash
cd EvidenceLedger
npm test
```

## Project structure

- [`index.html`](./index.html): Vite entry HTML
- [`src/App.tsx`](./src/App.tsx): main React UI and guided walkthrough orchestration
- [`src/domain/analysis.ts`](./src/domain/analysis.ts): evidence scoring, verdicts, gaps, contested ranking, matrix
- [`src/domain/explanations.ts`](./src/domain/explanations.ts): plain-English claim explanations
- [`src/domain/markdown.ts`](./src/domain/markdown.ts): Markdown summary export
- [`src/data/demos.ts`](./src/data/demos.ts): built-in demo scenarios
- [`tests/analysis.test.ts`](./tests/analysis.test.ts): unit tests for the scoring and classification model
- [`../Makefile`](../Makefile): repo-root shortcuts for install, dev, build, and preview

## Evidence math

### 1. Score each evidence link

Every support, contradiction, or mention link gets deterministic points:

- `points = (source reliability * link strength * link confidence) / 10000`

All three inputs are `0..100`, so the resulting points are also on a compact, inspectable `0..100` scale.

### 2. Aggregate by claim

For each claim, the ledger sums:

- support points
- contradiction points
- mention points

From those totals it derives:

- net pressure
- coverage
- certainty
- whether the claim looks supported, contradicted, contested, thin, or open

### 3. Surface what needs attention

The app then ranks:

- claims that are carrying the most evidence pressure
- contested claims with strong signal on both sides
- thin or open claims whose importance is high relative to the current evidence

## Limitations

- Reliability, strength, and confidence are still human judgments. The app makes them visible; it does not make them objective.
- Coverage is only as good as the source set you put in. Missing evidence can make a ledger look cleaner than reality.
- A neat verdict is not the same as truth. Especially in contested cases, the right response may be “collect better evidence,” not “pick a winner.”
- The scoring model is intentionally compact. It is designed to stay inspectable, which means it does not try to capture every nuance of epistemology.
