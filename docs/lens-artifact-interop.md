# Lens Artifact Interop

This document proposes a small, typed interop model for composing the lens tools into workflows without inventing a universal scenario schema.

The key idea is simple:

- scenario state stays local to each app
- stable outputs travel between apps as typed artifacts
- transforms between artifacts are explicit, narrow, and provenance-aware
- durable workflow state is append-only and records artifact transitions explicitly

## Three different kinds of state

The model works better if we keep three kinds of state separate.

### Tool-local editable scenario state

This is the mutable working state inside a lens app.

- owned by one app
- editable
- may contain incomplete edits and helper fields
- not a stable interop contract

### Stable typed artifact outputs

These are exported snapshots that can move between tools.

- typed by artifact kind
- versioned
- provenance-aware
- stable enough to reference in later workflow steps

### Workflow run state

This is not the scenario and not the artifact payload.

It is the durable execution history of a workflow:

- which artifacts were registered
- which transforms were requested, started, completed, or failed
- where human review occurred
- when branches split or merged
- what became superseded

This state should be append-only. It should describe transitions, not hide them inside a mutable context blob.

## Why artifacts instead of shared scenarios

Scenario state is editable and app-local. It contains the raw material an engine needs in order to think.

Artifacts are different:

- they are stable outputs or projections
- they can be referenced later without reopening the original scenario editor
- they are easier to reason about across tool boundaries because they are snapshots, not live models

That distinction matters. We do not want a giant cross-tool scenario schema. We want explicit exported artifacts with visible provenance.

## Artifact envelope

Every shareable artifact should live inside a provenance-aware envelope with:

- `id`
- `kind`
- `schemaVersion`
- `title`
- `createdAt`
- `payload`
- `provenance`

The payload stays kind-specific. The envelope provides the stable outer shape.

Provenance should record:

- which app produced the artifact
- which transform, if any, produced it
- which source artifacts it came from
- an optional reference back to the originating app-local scenario

This keeps interop inspectable.

## Artifact type registry

`lens-core` can maintain a tiny registry of known artifact kinds and human-readable metadata.

The registry is not a schema compiler and not a plugin marketplace. It is just a small index of known artifact kinds, for example:

- `ProblemFrame`
- `DecisionModel`
- `RankedOptions`
- `ExecutionPlan`
- `ClaimSet`
- `EvidenceMap`
- `RecommendationPacket`

This gives us a vocabulary without pretending every tool shares the same internal model.

## Transform contracts

Interop should happen through explicit transform contracts.

A transform should say:

- what artifact kind it accepts
- what artifact kind it produces
- a short description of its semantics
- how provenance is carried forward

For now, transforms should be narrow and mostly one-step projections. A transform is allowed to be opinionated if it says so plainly.

Examples:

- `DecisionModel -> RankedOptions`
  This is a projection transform, not a scoring engine. It assumes scores already exist in the input artifact and simply produces a clean ranked artifact.
- `ClaimSet -> EvidenceMap`
  This is a seeding transform. It carries claims forward and initializes empty sources/links rather than inventing evidence.
- `ExecutionPlan -> ClaimSet`
  This could exist later as a narrow projection that turns explicit plan assertions into inspectable claims, but it should remain app- or transform-specific rather than pretending every plan implies the same claims.

## Workflow DAG model

The workflow model should be thought of as a DAG of:

- artifact nodes
- transform application nodes

Edges represent explicit provenance:

- artifact -> transform application
- transform application -> derived artifact

That is enough to explain a workflow without building a full runner yet.

Importantly, the DAG is about artifact lineage, not live execution semantics.

## Append-only workflow event model

To connect artifact interop to durable workflow management, workflow execution should be recorded as append-only events.

Recommended event vocabulary:

- `ArtifactRegistered`
- `TransformRequested`
- `TransformStarted`
- `TransformCompleted`
- `TransformFailed`
- `HumanDecisionRecorded`
- `WorkflowBranched`
- `WorkflowMerged`
- `ArtifactSuperseded`
- `SchemaBridgeApplied`

These events are intentionally explicit:

- artifacts appear by being registered
- transforms move through visible lifecycle stages
- human intervention is recorded rather than implied
- branching and merging become first-class history
- schema bridging is observable instead of hidden inside deserialization

This makes replay and auditing possible without a giant mutable workflow object.

## Minimal declarative workflow spec

The workflow spec should stay small and declarative. It should define:

- allowed artifact kinds
- a transform graph
- readiness or guard conditions
- human review points
- terminal desired artifact kinds

The spec should not contain app-engine semantics. It should only say what transitions are allowed and what kinds of artifacts must exist before a step is ready.

Example shape:

- allowed kinds: `ProblemFrame`, `DecisionModel`, `RankedOptions`, `RecommendationPacket`
- steps:
  - `DecisionModel -> RankedOptions`
  - `RankedOptions + ProblemFrame -> RecommendationPacket`
- guards:
  - all required artifact kinds present
  - human decision recorded for a named review point
- terminal artifacts:
  - `RecommendationPacket`

Guard conditions should be explicit and small, such as:

- all artifacts of certain kinds exist
- any artifact of certain kinds exists
- a named human decision has been recorded

## Replay and projections

Append-only events are most useful when projections are simple to derive.

The initial projection set should include:

### Current artifact set

The latest active artifacts that exist in the run, excluding anything marked as superseded unless the consumer explicitly asks for history.

### Ready transform frontier

The set of transform steps whose input requirements are satisfied and whose guards currently pass.

### Run status

A compact projection such as:

- `idle`
- `waiting`
- `running`
- `needs_human_review`
- `completed`
- `failed`

### Provenance graph

The lineage graph connecting source artifacts, transform applications, derived artifacts, schema bridges, and branch/merge events.

### Branch history

The ordered history of branches, including:

- when a branch was created
- what branch it came from
- whether it is still active
- whether and when it merged

Replay should be deterministic because the event log is explicit about transitions.

## Schema bridges

Schema compatibility should also be explicit. If an artifact is upgraded across schema versions, that should appear as a `SchemaBridgeApplied` event rather than silently mutating the artifact in place.

That keeps provenance honest and avoids hidden version-magic.

## Editable scenario state vs stable artifact outputs

This distinction is the main safety rail.

Editable scenario state:

- belongs to an app
- is mutable
- can contain app-specific helper fields and incomplete edits
- should not be treated as a stable interop contract

Stable artifact outputs:

- are exported snapshots
- have explicit kinds
- travel across tool boundaries
- carry provenance and versioning

This lets us compose workflows without coercing every tool into a fake universal editor model.

## Recommended initial artifact set

- `ProblemFrame`
- `DecisionModel`
- `RankedOptions`
- `ExecutionPlan`
- `ClaimSet`
- `EvidenceMap`
- `RecommendationPacket`

These are output-oriented nouns, not scenario schemas.

## Concrete handoff: `ExecutionPlan -> ClaimSet -> EvidenceLedger`

The first real cross-lens path should stay intentionally narrow:

1. `Threadline` exports a compact `ExecutionPlan` artifact
2. `lens-core` applies `execution-plan-to-claim-set`
3. `EvidenceLedger` imports the `ClaimSet` artifact and seeds a ledger with claims only

### Transform assumptions

`execution-plan-to-claim-set` does not treat every task as a claim.

It projects a claim only when a task is:

- not already done, and
- schedule-critical, or
- under explicit deadline pressure via constraint issues

The transform emits one claim per projected task and carries task notes plus constraint text forward as claim notes.

### Limitations

- it is a planning-pressure projection, not a universal truth extractor
- it does not infer evidence, sources, or verdicts
- it does not try to translate every task into a claim-worthy statement
- the resulting `EvidenceLedger` scenario is only a seed and still needs human curation

## What this intentionally does not solve yet

- cross-tool live editing
- a workflow runner
- a universal artifact query language
- automatic transform discovery
- transforming every tool output into every other tool input
- semantic equivalence between decision, planning, and evidence engines

It also intentionally does not solve:

- scheduling policy for transform execution
- durable storage implementation details
- conflict resolution for merges beyond recording that a merge happened
- generic transformation of app-local scenario state

Those are future questions, and only worth answering if repeated real workflows demand them.

## Current recommendation

Implement only:

- shared artifact envelope types
- a tiny artifact registry
- a tiny transform contract type
- one or two narrow example transforms
- a thin workflow type layer if it clarifies the append-only orchestration boundary

Stop there until the repo demonstrates repeated real workflows that need more.
