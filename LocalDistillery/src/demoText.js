export const demoText = `# Product Sync - Local Distillery

Date: 2026-03-22
Attendees: Maya, Theo, Priya, Jordan

We agreed the browser-only requirement is non-negotiable. The offline promise needs to be explicit in the UI, in the README, and in the export metadata. Priya noted that users are going to paste long research notes, sprint writeups, and log snippets, so speed matters more than trying to be clever.

Action items:
- Jordan to add a visible "no network required" badge in the shell.
- Maya to tighten the demo content so first-run users immediately understand the product.
- Priya to define a plugin-style analyzer interface after v1 lands.

Open questions:
- Should we treat repeated headings as motifs or structure?
- How should the tool rank log lines with timestamps versus error lines?
- Do we want a future diff mode that compares two local files side by side?

Decisions:
- Keep v1 deterministic and local only.
- Avoid AI APIs, embeddings, auth, or analytics.
- Support text, markdown, JSON, and JSONL in the first release.

Notes:
The spec keeps returning to a few themes: local-only processing, information distillation, deterministic heuristics, fast feedback, and compact console-style UI. Theo repeated that "meeting notes become artifacts" should feel obvious after ten seconds. Priya repeated that the heuristics should stay explainable. Maya wants the digest to emphasize outcomes, decisions, and follow-up work rather than generic summaries.

TODO check whether checkbox lines like [ ] ship glossary mode after launch should be extracted.
[ ] Add a glossary stretch goal if the rest of the experience stays clean.
[ ] Review export shape for markdown and JSON parity.

The research backlog mentions timeline extraction, glossary generation, JSONL field inspection, and a future semantic analyzer running via WASM. Another note asks whether entity extraction should include products, teams, dates, and environments.

Why does the current draft bury the strongest promise halfway down the page?
What is the minimum useful summary when a user drops 8,000 lines of logs?

Repeated phrases:
local-only processing
deterministic heuristics
fast feedback
plugin-style analyzer
local-only processing`;
