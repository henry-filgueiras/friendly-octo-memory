# Lens Workbench

`lens-workbench` is a tiny sandbox app for the extracted `packages/lens-core` chassis.

It intentionally does **not** contain a generic engine or workflow runner. It is an operator bench for the shared shell, artifact envelopes, and explicit transforms.

## Manual artifact flow

The current real cross-lens path is:

1. In `Threadline`, export an `ExecutionPlan` artifact
2. In `Artifact Lab`, import that artifact and apply `execution-plan-to-claim-set`
3. Export the derived `ClaimSet` artifact
4. In `EvidenceLedger`, import the `ClaimSet` artifact to seed claims with empty sources and links

This is intentionally manual and inspectable. The point is to make the handoff legible before any future workflow runner exists.

## Freeform mode vs recipe mode

Artifact Lab has two operator modes:

- Freeform mode: choose any compatible transform for the current artifact
- Recipe mode: activate a named manual workflow and let the lab preselect the expected next transform

Recipe mode is still manual and inspectable. It does not run steps for you, hide intermediate artifacts, or keep background workflow state. It only makes a known path easier to follow.

Artifact Lab also shows a simple path-to-target preview for registered transforms. That preview is only discovery help. Execution is still manual, one transform click per step.

There is also a small `Use next step toward target` helper in the lab. It only preselects the first transform in the visible path; it does not run anything for you.

The first named recipe is:

- `ExecutionPlan -> ClaimSet -> EvidenceMap`

## Transform limitations

`execution-plan-to-claim-set` is deliberately narrow.

- It does not convert every task into a claim.
- It only projects non-done tasks that are schedule-critical or carrying explicit deadline pressure.
- It carries task notes and constraint text forward, but it does not infer evidence, sources, or verdicts.
- The imported `EvidenceLedger` scenario is just a seed that still needs human curation.

## Run locally

```bash
cd apps/lens-workbench
npm install
npm run dev
```
