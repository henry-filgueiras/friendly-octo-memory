import type {
  ClaimSetArtifact,
  EvidenceMapArtifact,
  ExecutionPlanArtifact,
  LensArtifactEnvelope,
  LensArtifactKind,
  RankedOptionsArtifact,
} from "./artifacts";

type SupportedComparisonKind = "ExecutionPlan" | "ClaimSet" | "EvidenceMap" | "RankedOptions";
type AnyLensArtifactEnvelope = {
  [K in LensArtifactKind]: LensArtifactEnvelope<K>;
}[LensArtifactKind];

interface LensArtifactHeadReference<TKind extends LensArtifactKind = LensArtifactKind> {
  id: string;
  kind: TKind;
  title: string;
  createdAt: string;
}

interface BaseArtifactHeadComparison<
  TType extends string,
  TBeforeKind extends LensArtifactKind = LensArtifactKind,
  TAfterKind extends LensArtifactKind = TBeforeKind,
> {
  type: TType;
  before: LensArtifactHeadReference<TBeforeKind>;
  after: LensArtifactHeadReference<TAfterKind>;
}

export interface LensArtifactKindMismatchComparison
  extends BaseArtifactHeadComparison<"kind-mismatch"> {
  beforeKind: LensArtifactKind;
  afterKind: LensArtifactKind;
}

export interface LensArtifactUnsupportedComparison
  extends BaseArtifactHeadComparison<"unsupported-kind"> {
  kind: Exclude<LensArtifactKind, SupportedComparisonKind>;
}

export interface ExecutionPlanTaskDiffEntry {
  id: string;
  name: string;
  status: ExecutionPlanArtifact["tasks"][number]["status"];
  critical: boolean;
  constraintIssueCount: number;
}

export interface ExecutionPlanCriticalityChange {
  taskId: string;
  taskName: string;
  beforeCritical: boolean;
  afterCritical: boolean;
}

export interface ExecutionPlanConstraintIssueChange {
  taskId: string;
  taskName: string;
  added: string[];
  removed: string[];
}

export interface ExecutionPlanArtifactComparison
  extends BaseArtifactHeadComparison<"ExecutionPlan", "ExecutionPlan"> {
  hasChanges: boolean;
  tasksAdded: ExecutionPlanTaskDiffEntry[];
  tasksRemoved: ExecutionPlanTaskDiffEntry[];
  criticalityChanges: ExecutionPlanCriticalityChange[];
  constraintIssueChanges: ExecutionPlanConstraintIssueChange[];
}

export interface ClaimSetClaimDiffEntry {
  id: string;
  statement: string;
  category?: string;
}

export interface ClaimSetCategoryChange {
  claimId: string;
  statement: string;
  beforeCategory?: string;
  afterCategory?: string;
}

export interface ClaimSetArtifactComparison
  extends BaseArtifactHeadComparison<"ClaimSet", "ClaimSet"> {
  hasChanges: boolean;
  claimsAdded: ClaimSetClaimDiffEntry[];
  claimsRemoved: ClaimSetClaimDiffEntry[];
  categoryChanges: ClaimSetCategoryChange[];
}

export interface EvidenceMapClaimDiffEntry {
  id: string;
  statement: string;
  category?: string;
}

export interface EvidenceMapSourceDiffEntry {
  id: string;
  title: string;
}

export interface EvidenceMapLinkDiffEntry {
  id: string;
  claimId: string;
  sourceId: string;
  stance: EvidenceMapArtifact["links"][number]["stance"];
}

export interface EvidenceMapCountChange {
  before: number;
  after: number;
}

export interface EvidenceMapArtifactComparison
  extends BaseArtifactHeadComparison<"EvidenceMap", "EvidenceMap"> {
  hasChanges: boolean;
  claimsAdded: EvidenceMapClaimDiffEntry[];
  claimsRemoved: EvidenceMapClaimDiffEntry[];
  sourcesAdded: EvidenceMapSourceDiffEntry[];
  sourcesRemoved: EvidenceMapSourceDiffEntry[];
  linksAdded: EvidenceMapLinkDiffEntry[];
  linksRemoved: EvidenceMapLinkDiffEntry[];
  coverage: {
    claims: EvidenceMapCountChange;
    sources: EvidenceMapCountChange;
    links: EvidenceMapCountChange;
    linkedClaims: EvidenceMapCountChange;
    uncoveredClaims: EvidenceMapCountChange;
  };
}

export interface RankedOptionRankChange {
  optionId: string;
  optionName: string;
  beforeRank: number;
  afterRank: number;
}

export interface RankedOptionExclusionDiffEntry {
  optionId: string;
  optionName: string;
  reasons: string[];
}

export interface RankedOptionsArtifactComparison
  extends BaseArtifactHeadComparison<"RankedOptions", "RankedOptions"> {
  hasChanges: boolean;
  rankChanges: RankedOptionRankChange[];
  exclusionsGained: RankedOptionExclusionDiffEntry[];
  exclusionsLost: RankedOptionExclusionDiffEntry[];
}

export type LensArtifactHeadComparison =
  | LensArtifactKindMismatchComparison
  | LensArtifactUnsupportedComparison
  | ExecutionPlanArtifactComparison
  | ClaimSetArtifactComparison
  | EvidenceMapArtifactComparison
  | RankedOptionsArtifactComparison;

function toHeadReference<TKind extends LensArtifactKind>(
  artifact: LensArtifactEnvelope<TKind>
): LensArtifactHeadReference<TKind> {
  return {
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    createdAt: artifact.createdAt,
  };
}

function compareText(left: string, right: string) {
  return left.localeCompare(right);
}

function sortByName<T extends { name: string; id: string }>(entries: T[]) {
  return [...entries].sort((left, right) => compareText(left.name, right.name) || compareText(left.id, right.id));
}

function sortByTitle<T extends { title: string; id: string }>(entries: T[]) {
  return [...entries].sort(
    (left, right) => compareText(left.title, right.title) || compareText(left.id, right.id)
  );
}

function sortByStatement<T extends { statement: string; id: string }>(entries: T[]) {
  return [...entries].sort(
    (left, right) => compareText(left.statement, right.statement) || compareText(left.id, right.id)
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort(compareText);
}

function diffTextList(before: string[], after: string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  return {
    added: uniqueSorted(after.filter((value) => !beforeSet.has(value))),
    removed: uniqueSorted(before.filter((value) => !afterSet.has(value))),
  };
}

function compareExecutionPlanArtifacts(
  before: LensArtifactEnvelope<"ExecutionPlan">,
  after: LensArtifactEnvelope<"ExecutionPlan">
): ExecutionPlanArtifactComparison {
  const beforeTasks = new Map(before.payload.tasks.map((task) => [task.id, task] as const));
  const afterTasks = new Map(after.payload.tasks.map((task) => [task.id, task] as const));

  const tasksAdded = sortByName(
    after.payload.tasks
      .filter((task) => !beforeTasks.has(task.id))
      .map((task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        critical: task.critical,
        constraintIssueCount: task.constraintIssues.length,
      }))
  );

  const tasksRemoved = sortByName(
    before.payload.tasks
      .filter((task) => !afterTasks.has(task.id))
      .map((task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        critical: task.critical,
        constraintIssueCount: task.constraintIssues.length,
      }))
  );

  const criticalityChanges = sortByName(
    before.payload.tasks
      .filter((task) => afterTasks.has(task.id))
      .flatMap((task) => {
        const nextTask = afterTasks.get(task.id)!;

        if (task.critical === nextTask.critical) {
          return [];
        }

        return [
          {
            id: task.id,
            name: nextTask.name,
            taskId: task.id,
            taskName: nextTask.name,
            beforeCritical: task.critical,
            afterCritical: nextTask.critical,
          },
        ];
      })
  ).map(({ taskId, taskName, beforeCritical, afterCritical }) => ({
    taskId,
    taskName,
    beforeCritical,
    afterCritical,
  }));

  const constraintIssueChanges = sortByName(
    before.payload.tasks
      .filter((task) => afterTasks.has(task.id))
      .flatMap((task) => {
        const nextTask = afterTasks.get(task.id)!;
        const change = diffTextList(task.constraintIssues, nextTask.constraintIssues);

        if (change.added.length === 0 && change.removed.length === 0) {
          return [];
        }

        return [
          {
            id: task.id,
            name: nextTask.name,
            taskId: task.id,
            taskName: nextTask.name,
            added: change.added,
            removed: change.removed,
          },
        ];
      })
  ).map(({ taskId, taskName, added, removed }) => ({
    taskId,
    taskName,
    added,
    removed,
  }));

  return {
    type: "ExecutionPlan",
    before: toHeadReference(before),
    after: toHeadReference(after),
    hasChanges:
      tasksAdded.length > 0 ||
      tasksRemoved.length > 0 ||
      criticalityChanges.length > 0 ||
      constraintIssueChanges.length > 0,
    tasksAdded,
    tasksRemoved,
    criticalityChanges,
    constraintIssueChanges,
  };
}

function compareClaimSetArtifacts(
  before: LensArtifactEnvelope<"ClaimSet">,
  after: LensArtifactEnvelope<"ClaimSet">
): ClaimSetArtifactComparison {
  const beforeClaims = new Map(before.payload.claims.map((claim) => [claim.id, claim] as const));
  const afterClaims = new Map(after.payload.claims.map((claim) => [claim.id, claim] as const));

  const claimsAdded = sortByStatement(
    after.payload.claims
      .filter((claim) => !beforeClaims.has(claim.id))
      .map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        category: claim.category,
      }))
  );

  const claimsRemoved = sortByStatement(
    before.payload.claims
      .filter((claim) => !afterClaims.has(claim.id))
      .map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        category: claim.category,
      }))
  );

  const categoryChanges = sortByStatement(
    before.payload.claims
      .filter((claim) => afterClaims.has(claim.id))
      .flatMap((claim) => {
        const nextClaim = afterClaims.get(claim.id)!;

        if ((claim.category ?? "") === (nextClaim.category ?? "")) {
          return [];
        }

        return [
          {
            id: claim.id,
            statement: nextClaim.statement,
            claimId: claim.id,
            beforeCategory: claim.category,
            afterCategory: nextClaim.category,
          },
        ];
      })
  ).map(({ claimId, statement, beforeCategory, afterCategory }) => ({
    claimId,
    statement,
    beforeCategory,
    afterCategory,
  }));

  return {
    type: "ClaimSet",
    before: toHeadReference(before),
    after: toHeadReference(after),
    hasChanges: claimsAdded.length > 0 || claimsRemoved.length > 0 || categoryChanges.length > 0,
    claimsAdded,
    claimsRemoved,
    categoryChanges,
  };
}

function countLinkedClaims(artifact: LensArtifactEnvelope<"EvidenceMap">) {
  return new Set(artifact.payload.links.map((link) => link.claimId)).size;
}

function compareEvidenceMapArtifacts(
  before: LensArtifactEnvelope<"EvidenceMap">,
  after: LensArtifactEnvelope<"EvidenceMap">
): EvidenceMapArtifactComparison {
  const beforeClaims = new Map(before.payload.claims.map((claim) => [claim.id, claim] as const));
  const afterClaims = new Map(after.payload.claims.map((claim) => [claim.id, claim] as const));
  const beforeSources = new Map(before.payload.sources.map((source) => [source.id, source] as const));
  const afterSources = new Map(after.payload.sources.map((source) => [source.id, source] as const));
  const beforeLinks = new Map(before.payload.links.map((link) => [link.id, link] as const));
  const afterLinks = new Map(after.payload.links.map((link) => [link.id, link] as const));

  const claimsAdded = sortByStatement(
    after.payload.claims
      .filter((claim) => !beforeClaims.has(claim.id))
      .map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        category: claim.category,
      }))
  );
  const claimsRemoved = sortByStatement(
    before.payload.claims
      .filter((claim) => !afterClaims.has(claim.id))
      .map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        category: claim.category,
      }))
  );
  const sourcesAdded = sortByTitle(
    after.payload.sources
      .filter((source) => !beforeSources.has(source.id))
      .map((source) => ({
        id: source.id,
        title: source.title,
      }))
  );
  const sourcesRemoved = sortByTitle(
    before.payload.sources
      .filter((source) => !afterSources.has(source.id))
      .map((source) => ({
        id: source.id,
        title: source.title,
      }))
  );
  const linksAdded = [...after.payload.links]
    .filter((link) => !beforeLinks.has(link.id))
    .map((link) => ({
      id: link.id,
      claimId: link.claimId,
      sourceId: link.sourceId,
      stance: link.stance,
    }))
    .sort(
      (left, right) =>
        compareText(left.claimId, right.claimId) ||
        compareText(left.sourceId, right.sourceId) ||
        compareText(left.id, right.id)
    );
  const linksRemoved = [...before.payload.links]
    .filter((link) => !afterLinks.has(link.id))
    .map((link) => ({
      id: link.id,
      claimId: link.claimId,
      sourceId: link.sourceId,
      stance: link.stance,
    }))
    .sort(
      (left, right) =>
        compareText(left.claimId, right.claimId) ||
        compareText(left.sourceId, right.sourceId) ||
        compareText(left.id, right.id)
    );

  const coverage = {
    claims: {
      before: before.payload.claims.length,
      after: after.payload.claims.length,
    },
    sources: {
      before: before.payload.sources.length,
      after: after.payload.sources.length,
    },
    links: {
      before: before.payload.links.length,
      after: after.payload.links.length,
    },
    linkedClaims: {
      before: countLinkedClaims(before),
      after: countLinkedClaims(after),
    },
    uncoveredClaims: {
      before: before.payload.claims.length - countLinkedClaims(before),
      after: after.payload.claims.length - countLinkedClaims(after),
    },
  };

  const hasCoverageChanges = Object.values(coverage).some((change) => change.before !== change.after);

  return {
    type: "EvidenceMap",
    before: toHeadReference(before),
    after: toHeadReference(after),
    hasChanges:
      claimsAdded.length > 0 ||
      claimsRemoved.length > 0 ||
      sourcesAdded.length > 0 ||
      sourcesRemoved.length > 0 ||
      linksAdded.length > 0 ||
      linksRemoved.length > 0 ||
      hasCoverageChanges,
    claimsAdded,
    claimsRemoved,
    sourcesAdded,
    sourcesRemoved,
    linksAdded,
    linksRemoved,
    coverage,
  };
}

function compareRankedOptionsArtifacts(
  before: LensArtifactEnvelope<"RankedOptions">,
  after: LensArtifactEnvelope<"RankedOptions">
): RankedOptionsArtifactComparison {
  const beforeRanked = new Map(before.payload.ranked.map((entry) => [entry.optionId, entry] as const));
  const afterRanked = new Map(after.payload.ranked.map((entry) => [entry.optionId, entry] as const));
  const beforeExcluded = new Map(
    before.payload.excluded.map((entry) => [entry.optionId, entry] as const)
  );
  const afterExcluded = new Map(after.payload.excluded.map((entry) => [entry.optionId, entry] as const));

  const rankChanges = [...before.payload.ranked]
    .filter((entry) => afterRanked.has(entry.optionId))
    .flatMap((entry) => {
      const nextEntry = afterRanked.get(entry.optionId)!;

      if (entry.rank === nextEntry.rank) {
        return [];
      }

      return [
        {
          optionId: entry.optionId,
          optionName: nextEntry.optionName,
          beforeRank: entry.rank,
          afterRank: nextEntry.rank,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.afterRank - right.afterRank ||
        compareText(left.optionName, right.optionName) ||
        compareText(left.optionId, right.optionId)
    );

  const exclusionsGained = [...after.payload.excluded]
    .filter((entry) => !beforeExcluded.has(entry.optionId))
    .map((entry) => ({
      optionId: entry.optionId,
      optionName: entry.optionName,
      reasons: [...entry.reasons],
    }))
    .sort(
      (left, right) =>
        compareText(left.optionName, right.optionName) || compareText(left.optionId, right.optionId)
    );

  const exclusionsLost = [...before.payload.excluded]
    .filter((entry) => !afterExcluded.has(entry.optionId))
    .map((entry) => ({
      optionId: entry.optionId,
      optionName: entry.optionName,
      reasons: [...entry.reasons],
    }))
    .sort(
      (left, right) =>
        compareText(left.optionName, right.optionName) || compareText(left.optionId, right.optionId)
    );

  return {
    type: "RankedOptions",
    before: toHeadReference(before),
    after: toHeadReference(after),
    hasChanges: rankChanges.length > 0 || exclusionsGained.length > 0 || exclusionsLost.length > 0,
    rankChanges,
    exclusionsGained,
    exclusionsLost,
  };
}

export function compareLensArtifactHeads(
  before: AnyLensArtifactEnvelope,
  after: AnyLensArtifactEnvelope
): LensArtifactHeadComparison {
  if (before.kind !== after.kind) {
    return {
      type: "kind-mismatch",
      before: toHeadReference(before),
      after: toHeadReference(after),
      beforeKind: before.kind,
      afterKind: after.kind,
    };
  }

  switch (before.kind) {
    case "ExecutionPlan":
      return compareExecutionPlanArtifacts(
        before as LensArtifactEnvelope<"ExecutionPlan">,
        after as LensArtifactEnvelope<"ExecutionPlan">
      );
    case "ClaimSet":
      return compareClaimSetArtifacts(
        before as LensArtifactEnvelope<"ClaimSet">,
        after as LensArtifactEnvelope<"ClaimSet">
      );
    case "EvidenceMap":
      return compareEvidenceMapArtifacts(
        before as LensArtifactEnvelope<"EvidenceMap">,
        after as LensArtifactEnvelope<"EvidenceMap">
      );
    case "RankedOptions":
      return compareRankedOptionsArtifacts(
        before as LensArtifactEnvelope<"RankedOptions">,
        after as LensArtifactEnvelope<"RankedOptions">
      );
    default:
      return {
        type: "unsupported-kind",
        kind: before.kind as Exclude<LensArtifactKind, SupportedComparisonKind>,
        before: toHeadReference(before),
        after: toHeadReference(after),
      };
  }
}
