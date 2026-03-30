# Local Distillery

Local Distillery is a compact, local-only browser tool for turning pasted text or dropped local files into a structured artifact. It runs entirely client-side with no backend, no telemetry, no auth, and no network processing.

## What it does

- Accepts pasted text or dropped local `.txt`, `.md`, `.json`, and `.jsonl` files
- Distills input into:
  - one-line summary
  - short bullet digest
  - extracted action items
  - extracted open questions
  - repeated terms and motifs
  - concept and entity list
- Supports mode presets for Notes, Meeting, Research, Logs, and Spec
- Supports light, medium, and aggressive compression strengths
- Lets you toggle output sections, copy them individually, and export the full result as Markdown or JSON
- Persists the current working state in `localStorage`

## Run locally

Because this repo is built as a static browser app, you can open [`index.html`](/Users/henry/LocalDistillery/index.html) directly in a browser. For the smoothest local development workflow, you can also serve the folder with a tiny static server, for example:

```bash
cd /Users/henry/LocalDistillery
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Project structure

- [`index.html`](/Users/henry/LocalDistillery/index.html): app shell and layout
- [`styles.css`](/Users/henry/LocalDistillery/styles.css): console-inspired UI styling
- [`src/main.js`](/Users/henry/LocalDistillery/src/main.js): app state, events, rendering, persistence, export flow
- [`src/analyzer.js`](/Users/henry/LocalDistillery/src/analyzer.js): deterministic heuristics and export builders
- [`src/storage.js`](/Users/henry/LocalDistillery/src/storage.js): `localStorage` persistence helpers
- [`src/demoText.js`](/Users/henry/LocalDistillery/src/demoText.js): demo dataset for the empty state

## How the heuristics work

All v1 analysis is deterministic and local. There are no AI calls, embeddings, remote models, or network fetches involved in processing.

### 1. Sentence splitting

The analyzer normalizes line endings and splits text into sentences using punctuation boundaries. Very short fragments are discarded to reduce noise.

### 2. Frequency analysis

The app tokenizes lowercase word forms, removes common stop words, and counts repeated terms. These term frequencies are reused across summary ranking and motif extraction.

### 3. Lightweight chunk ranking

Each sentence receives a simple score based on:

- repeated informative terms
- presence of decisions, risks, requirements, or action-like wording
- presence of numbers
- whether the sentence appears near the start
- mode-specific hint words such as `decision`, `finding`, `error`, or `requirement`

Top-ranked sentences drive the one-line summary and bullet digest.

### 4. Heading detection

The analyzer treats markdown headings, title-like labels ending in `:`, and all-caps structural lines as lightweight section signals. These can influence the summary context.

### 5. Action item extraction

Action items are collected from:

- markdown checkbox lines like `[ ] Ship glossary mode`
- bulleted lines containing imperative or task-like wording
- short standalone lines containing cues such as `todo`, `review`, `fix`, `define`, `document`, or `investigate`

### 6. Open question extraction

Questions are extracted from:

- lines ending with `?`
- sentences beginning with interrogatives such as `what`, `how`, `why`, or `should`

### 7. Repeated phrase and motif extraction

The analyzer builds short n-grams from non-stop-word tokens and surfaces phrases that recur more than once. It also falls back to repeated single terms so motif output stays useful on sparse input.

### 8. Entity and concept detection

The concept list uses lightweight pattern matching for:

- title-cased names
- uppercase identifiers
- ISO-like dates

This is intentionally shallow and explainable rather than semantic.

## Privacy and local-only behavior

- Processing happens in the browser only
- No data is uploaded
- No analytics or telemetry are included
- No authentication or accounts are required
- State is stored locally in the browser via `localStorage`

## Future extension points

The current structure leaves clean places to extend the tool without changing the local-only contract:

- semantic analyzers running from local WASM bundles
- a plugin-like analyzer registry layered over the current deterministic sections
- diff mode for comparing two local inputs
- timeline extraction from dated events
- glossary generation from recurring terms plus definitions
- JSONL field inspection and schema profiling
- IndexedDB-based history for larger local workspaces

## Notes on the tech choice

The requested preference was React + TypeScript + Vite. This workspace did not include Node or Vite, so v1 is implemented as a modular static SPA using browser-native ES modules. The architecture is intentionally small and migration-friendly if you want the next step to be a React + TypeScript + Vite version.
