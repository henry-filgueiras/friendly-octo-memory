# Lens Artifact Interop

This document proposes a small, typed interop model for composing the lens tools into workflows without inventing a universal scenario schema.

The key idea is simple:

- scenario state stays local to each app
- stable outputs travel between apps as typed artifacts
- transforms between artifacts are explicit, narrow, and provenance-aware

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

## What this intentionally does not solve yet

- cross-tool live editing
- a workflow runner
- a universal artifact query language
- automatic transform discovery
- transforming every tool output into every other tool input
- semantic equivalence between decision, planning, and evidence engines

Those are future questions, and only worth answering if repeated real workflows demand them.

## Current recommendation

Implement only:

- shared artifact envelope types
- a tiny artifact registry
- a tiny transform contract type
- one or two narrow example transforms

Stop there until the repo demonstrates repeated real workflows that need more.
