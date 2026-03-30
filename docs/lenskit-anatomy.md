# LensKit Anatomy

This is a conservative extraction pass across `TradeoffLens`, `Threadline`, and `EvidenceLedger`.

The goal is not to invent a meta-framework. The goal is to identify the boring shared chassis, extract that first, and leave the semantic engines and view logic where they belong.

## Comparison

| Area | TradeoffLens | Threadline | EvidenceLedger | Classification | Notes |
| --- | --- | --- | --- | --- | --- |
| Scenario model | Candidates, criteria, values, weights, constraints | Lanes, tasks, dependencies, schedule constraints, confidence | Claims, sources, evidence links, stance, reliability | `tool-specific` | All three are structured scenarios, but the fields and invariants are fundamentally different. |
| Normalization | Numeric normalization, enum utility, boolean preference | Duration/confidence transforms, scheduling order, capacity handling | Reliability x strength x confidence, same-source grouping | `shared shape, different semantics` | Each app has a deterministic “convert raw inputs into comparable engine values” layer, but the math is not reusable without smearing domain intent. |
| Persistence / import / export | `localStorage`, JSON import, JSON export, Markdown export | `localStorage`, JSON import, JSON export, Markdown export | `localStorage`, JSON import, JSON export, Markdown export | `shared now` | Same browser APIs and same operational flow. Good extraction material. |
| Demo loading | Quick-start scenarios and guided demo seed | Quick-start scenarios and guided demo seed | Quick-start scenarios and guided demo seed | `shared now` | The content differs, but the contract shape is aligned enough to share. |
| Editor pane | Monolithic in `App.tsx`; edits candidates and criteria | Dedicated `EditorPane`; edits lanes and tasks | Dedicated `EditorPane`; edits claims, sources, links | `shared shape, different semantics` | All three have “left pane edits scenario state,” but field widgets and transitions remain domain-specific. |
| Analysis pane | Rankings, excluded, pairwise, frontier | Timeline, dependencies, diagnostics, scenarios | Claims, contested, gaps, matrix | `tool-specific` | The pane role is shared; the views are not. |
| Inspector pane | Candidate explanation and contribution breakdown | Task explanation and leverage/risk moves | Claim explanation and next-evidence cues | `shared shape, different semantics` | Same “explain selected entity” slot, different content model. |
| Explanation generation | “Why this candidate ranks here” | “Why this task matters / slips” | “Why this claim looks supported/contested/thin” | `shared shape, different semantics` | All are plain-English renderers over deterministic engines, but the source data differs too much to abstract yet. |
| Markdown export | Scenario summary + ranking analysis | Plan brief + bottlenecks + schedule outcome | Claim/evidence summary + gaps/contested | `shared shape, different semantics` | Same export channel, different sections and semantics. Keep generator logic per tool. |
| Deterministic engine | Weighted ranking + dominance + Pareto + sensitivity | Scheduling + critical path + risk + delay impact | Evidence grouping + verdicts + matrix + gap ranking | `do not abstract yet` | This is the heart of each product. Shared engine abstractions would be false unification right now. |
| Stock views | Tabs, cards, tables, frontier plot | Timeline bars, SVG dependency graph, diagnostics cards | Claim cards, contested list, matrix | `tool-specific` | The UI idioms reflect the domain. Abstracting them now would make the apps blurrier. |
| Tool-specific logic | Hard constraints, enum scoring, Pareto frontier | Capacity lanes, dependency cycles, slip propagation | Evidence independence, mixed stance, coverage diversity | `tool-specific` | These are the reasons the tools deserve to exist separately. |

## Extraction decision

### Shared now

Extract these immediately into `packages/lens-core`:

- local persistence helpers
- JSON import/export helpers
- download/export helpers
- demo scenario contract types
- shell layout primitives

### Shared shape, different semantics

These should keep a similar architecture, but not a generic implementation yet:

- editor panes
- inspector panes
- explanation generation
- markdown export structure
- normalization stages

The right move is conventions and light utility support, not a generic schema language.

### Tool-specific

Keep these in each tool:

- scenario domain types
- analysis tabs and stock views
- engine-specific metrics and heuristics
- domain-specific helper functions

### Do not abstract yet

Do not build any generic layer for:

- formula systems
- arbitrary scenario DSLs
- pluggable engines
- codegen for panes or exports
- “one app to rule them all” runtime composition

Those ideas would optimize for future coincidence before we have earned it.

## What still resists abstraction

The stubborn part is not the browser plumbing. It is the semantic middle.

- `TradeoffLens` is about relative utility, weights, and hard constraints.
- `Threadline` is about partial order, capacity, and schedule propagation.
- `EvidenceLedger` is about evidence independence, contradiction, and source diversity.

All three have a left pane, a middle pane, and an explanation pane, but those are structural coincidences. The underlying objects, invariants, and derived states are different enough that a generic model would mostly be a translation tax.

That is why this pass extracts the chassis first and stops there.

## Strangler plan

1. Extract shared browser infrastructure into `packages/lens-core`.
2. Port `TradeoffLens` to the shared utilities first.
3. Use `apps/lens-workbench` as a small proving ground for the shell primitives.
4. Only after that, consider whether `Threadline` and `EvidenceLedger` should adopt the same utility layer incrementally.
