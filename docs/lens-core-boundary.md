# `lens-core` Boundary

The canonical boundary guidance now lives in [`packages/lens-core/README.md`](../packages/lens-core/README.md).

This doc remains as a lightweight pointer so the repo-level design notes still have a stable reference alongside [`docs/lens-runtime-boundary.md`](./lens-runtime-boundary.md).

In short:

- `lens-core` owns the boring shared chassis
- app engines still own their own semantics
- the runtime seam names lifecycle hooks, not a generic engine
