import { getLensArtifactDefinition } from "lens-core";
import type { LensArtifactKind } from "lens-core";
import type { ArtifactLabRunJournal } from "./runJournal";
import { isArtifactLabRunJournal } from "./runJournal";

export const ARTIFACT_LAB_WORKSPACE_STORAGE_KEY = "lens-workbench.workspace";

export interface ArtifactLabWorkspace {
  workspaceType: "ArtifactLabWorkspace";
  schemaVersion: 1;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  knownRunJournals: ArtifactLabRunJournal[];
  currentSessionId: string;
  comparisonSessionId: string;
  currentTargetArtifactKind?: LensArtifactKind | "";
}

let workspaceCounter = 0;

function createWorkspaceId() {
  workspaceCounter += 1;
  return `workspace-${Date.now()}-${workspaceCounter}`;
}

function isKnownArtifactKind(value: unknown): value is LensArtifactKind {
  return typeof value === "string" && Boolean(getLensArtifactDefinition(value as LensArtifactKind));
}

export function createArtifactLabWorkspace(
  initialJournal: ArtifactLabRunJournal,
  createdAt = new Date().toISOString()
): ArtifactLabWorkspace {
  return {
    workspaceType: "ArtifactLabWorkspace",
    schemaVersion: 1,
    workspaceId: createWorkspaceId(),
    createdAt,
    updatedAt: createdAt,
    knownRunJournals: [initialJournal],
    currentSessionId: initialJournal.sessionId,
    comparisonSessionId: "",
    currentTargetArtifactKind: "",
  };
}

export function isArtifactLabWorkspace(value: unknown): value is ArtifactLabWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.workspaceType === "ArtifactLabWorkspace" &&
    candidate.schemaVersion === 1 &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.knownRunJournals) &&
    candidate.knownRunJournals.length > 0 &&
    candidate.knownRunJournals.every((journal) => isArtifactLabRunJournal(journal)) &&
    typeof candidate.currentSessionId === "string" &&
    typeof candidate.comparisonSessionId === "string" &&
    (candidate.currentTargetArtifactKind === undefined ||
      candidate.currentTargetArtifactKind === "" ||
      isKnownArtifactKind(candidate.currentTargetArtifactKind))
  );
}

export function syncArtifactLabWorkspace(
  workspace: ArtifactLabWorkspace,
  updatedAt = workspace.updatedAt
): ArtifactLabWorkspace {
  const seen = new Set<string>();
  const knownRunJournals = workspace.knownRunJournals.filter((journal) => {
    if (seen.has(journal.sessionId)) {
      return false;
    }

    seen.add(journal.sessionId);
    return true;
  });
  const fallbackCurrentSessionId = knownRunJournals[0]?.sessionId ?? "";
  const currentSessionId = knownRunJournals.some(
    (journal) => journal.sessionId === workspace.currentSessionId
  )
    ? workspace.currentSessionId
    : fallbackCurrentSessionId;
  const comparisonSessionId =
    workspace.comparisonSessionId &&
    workspace.comparisonSessionId !== currentSessionId &&
    knownRunJournals.some((journal) => journal.sessionId === workspace.comparisonSessionId)
      ? workspace.comparisonSessionId
      : "";
  const currentTargetArtifactKind =
    workspace.currentTargetArtifactKind && isKnownArtifactKind(workspace.currentTargetArtifactKind)
      ? workspace.currentTargetArtifactKind
      : "";

  return {
    ...workspace,
    knownRunJournals,
    currentSessionId,
    comparisonSessionId,
    currentTargetArtifactKind,
    updatedAt,
  };
}

export function parseArtifactLabWorkspace(value: unknown): ArtifactLabWorkspace | null {
  if (!isArtifactLabWorkspace(value)) {
    return null;
  }

  return syncArtifactLabWorkspace(value);
}

export function loadArtifactLabWorkspaceFromStorage(
  storageKey = ARTIFACT_LAB_WORKSPACE_STORAGE_KEY
): ArtifactLabWorkspace | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return null;
    }

    return parseArtifactLabWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveArtifactLabWorkspaceToStorage(
  workspace: ArtifactLabWorkspace,
  storageKey = ARTIFACT_LAB_WORKSPACE_STORAGE_KEY
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(workspace));
}
