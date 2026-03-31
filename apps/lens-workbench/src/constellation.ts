import type { LensArtifactKind } from "lens-core";

export interface ConstellationSessionSnapshot {
  sessionId: string;
  createdAt: string;
  eventCount: number;
  forkedFromSessionId?: string;
  currentArtifactKind?: LensArtifactKind;
  currentArtifactTitle?: string;
  activeRecipeId?: string | null;
  completedRecipeSteps: number;
}

export interface WorkspaceConstellationStar {
  id: string;
  x: number;
  y: number;
  radius: number;
  opacity: number;
}

export interface WorkspaceConstellationLink {
  fromSessionId: string;
  toSessionId: string;
  path: string;
}

export interface WorkspaceConstellationNode {
  sessionId: string;
  label: string;
  artifactKind?: LensArtifactKind;
  artifactTitle?: string;
  activeRecipeId?: string | null;
  completedRecipeSteps: number;
  eventCount: number;
  depth: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  isCurrent: boolean;
  isComparison: boolean;
}

export interface WorkspaceConstellationLayout {
  width: number;
  height: number;
  stars: WorkspaceConstellationStar[];
  links: WorkspaceConstellationLink[];
  nodes: WorkspaceConstellationNode[];
  kindsPresent: LensArtifactKind[];
}

const ARTIFACT_COLORS: Record<LensArtifactKind, string> = {
  ProblemFrame: "#7fb5ff",
  DecisionModel: "#f0c15b",
  RankedOptions: "#f28779",
  ExecutionPlan: "#5dc7c0",
  ClaimSet: "#e0a53c",
  EvidenceMap: "#a2d96b",
  RecommendationPacket: "#c694ff",
};

const FALLBACK_COLOR = "#8fa3ad";

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededGenerator(seed: string) {
  let state = hashText(seed) || 1;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getConstellationArtifactColor(kind?: LensArtifactKind) {
  return kind ? ARTIFACT_COLORS[kind] : FALLBACK_COLOR;
}

function getDepth(
  snapshot: ConstellationSessionSnapshot,
  byId: Map<string, ConstellationSessionSnapshot>,
  cache: Map<string, number>,
  stack = new Set<string>()
): number {
  const cached = cache.get(snapshot.sessionId);

  if (cached !== undefined) {
    return cached;
  }

  if (!snapshot.forkedFromSessionId || !byId.has(snapshot.forkedFromSessionId)) {
    cache.set(snapshot.sessionId, 0);
    return 0;
  }

  if (stack.has(snapshot.sessionId)) {
    cache.set(snapshot.sessionId, 0);
    return 0;
  }

  stack.add(snapshot.sessionId);
  const parent = byId.get(snapshot.forkedFromSessionId)!;
  const depth = getDepth(parent, byId, cache, stack) + 1;
  stack.delete(snapshot.sessionId);
  cache.set(snapshot.sessionId, depth);
  return depth;
}

export function buildWorkspaceConstellation(
  snapshots: ConstellationSessionSnapshot[],
  currentSessionId: string,
  comparisonSessionId: string,
  seed = "artifact-lab"
): WorkspaceConstellationLayout {
  const width = 980;
  const marginX = 72;
  const marginY = 58;
  const byId = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot] as const));
  const depthCache = new Map<string, number>();
  const snapshotsWithDepth = snapshots.map((snapshot) => ({
    ...snapshot,
    depth: getDepth(snapshot, byId, depthCache),
  }));

  const groupedByDepth = new Map<number, Array<(typeof snapshotsWithDepth)[number]>>();
  for (const snapshot of snapshotsWithDepth) {
    groupedByDepth.set(snapshot.depth, [...(groupedByDepth.get(snapshot.depth) ?? []), snapshot]);
  }

  for (const [depth, entries] of groupedByDepth.entries()) {
    groupedByDepth.set(
      depth,
      [...entries].sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.sessionId.localeCompare(right.sessionId)
      )
    );
  }

  const maxDepth = Math.max(...snapshotsWithDepth.map((snapshot) => snapshot.depth), 0);
  const maxRows = Math.max(...[...groupedByDepth.values()].map((entries) => entries.length), 1);
  const height = Math.max(320, marginY * 2 + Math.max(0, maxRows - 1) * 96);
  const columnGap = maxDepth === 0 ? 0 : (width - marginX * 2) / maxDepth;

  const nodes = snapshotsWithDepth
    .slice()
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.sessionId.localeCompare(right.sessionId)
    )
    .map((snapshot, index) => {
      const columnEntries = groupedByDepth.get(snapshot.depth) ?? [snapshot];
      const rowIndex = columnEntries.findIndex((entry) => entry.sessionId === snapshot.sessionId);
      const spacing =
        columnEntries.length <= 1 ? 0 : (height - marginY * 2) / (columnEntries.length - 1);
      const baseX = maxDepth === 0 ? width / 2 : marginX + snapshot.depth * columnGap;
      const baseY =
        columnEntries.length <= 1 ? height / 2 : marginY + rowIndex * spacing;
      const jitterX = (hashText(`${snapshot.sessionId}:x`) % 18) - 9;
      const jitterY = (hashText(`${snapshot.sessionId}:y`) % 22) - 11;

      return {
        sessionId: snapshot.sessionId,
        label: `Run ${index + 1}`,
        artifactKind: snapshot.currentArtifactKind,
        artifactTitle: snapshot.currentArtifactTitle,
        activeRecipeId: snapshot.activeRecipeId,
        completedRecipeSteps: snapshot.completedRecipeSteps,
        eventCount: snapshot.eventCount,
        depth: snapshot.depth,
        x: clamp(baseX + jitterX, marginX, width - marginX),
        y: clamp(baseY + jitterY, marginY, height - marginY),
        radius: 12 + Math.min(11, snapshot.eventCount),
        color: getConstellationArtifactColor(snapshot.currentArtifactKind),
        isCurrent: snapshot.sessionId === currentSessionId,
        isComparison: snapshot.sessionId === comparisonSessionId,
      };
    });

  const nodeById = new Map(nodes.map((node) => [node.sessionId, node] as const));
  const links = snapshotsWithDepth
    .filter((snapshot) => snapshot.forkedFromSessionId && nodeById.has(snapshot.forkedFromSessionId))
    .map((snapshot) => {
      const from = nodeById.get(snapshot.forkedFromSessionId!)!;
      const to = nodeById.get(snapshot.sessionId)!;
      const controlX = (from.x + to.x) / 2;
      const controlOffset = Math.max(18, Math.abs(to.x - from.x) * 0.2);

      return {
        fromSessionId: from.sessionId,
        toSessionId: to.sessionId,
        path: `M ${from.x} ${from.y} C ${controlX - controlOffset} ${from.y}, ${
          controlX + controlOffset
        } ${to.y}, ${to.x} ${to.y}`,
      };
    });

  const starRandom = createSeededGenerator(seed);
  const stars = Array.from({ length: 24 }, (_, index) => ({
    id: `star-${index + 1}`,
    x: Math.round(24 + starRandom() * (width - 48)),
    y: Math.round(18 + starRandom() * (height - 36)),
    radius: 0.7 + starRandom() * 1.9,
    opacity: 0.2 + starRandom() * 0.5,
  }));

  const kindsPresent = [...new Set(nodes.flatMap((node) => (node.artifactKind ? [node.artifactKind] : [])))];

  return {
    width,
    height,
    stars,
    links,
    nodes,
    kindsPresent,
  };
}
