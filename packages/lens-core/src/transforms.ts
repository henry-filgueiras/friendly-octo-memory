import type {
  ClaimSetArtifact,
  ExecutionPlanArtifact,
  LensArtifactEnvelope,
  LensArtifactKind,
  LensArtifactPayloadByKind,
  LensArtifactProvenance,
} from "./artifacts";

export interface LensTransformContext {
  artifactId: string;
  createdAt: string;
  title?: string;
  producedByApp: string;
  sourceScenario?: LensArtifactProvenance["sourceScenario"];
}

export interface LensTransform<TInputKind extends LensArtifactKind, TOutputKind extends LensArtifactKind> {
  id: string;
  name: string;
  inputKind: TInputKind;
  outputKind: TOutputKind;
  description: string;
  run: (
    input: LensArtifactEnvelope<TInputKind>,
    context: LensTransformContext
  ) => LensArtifactEnvelope<TOutputKind>;
}

function createDerivedArtifact<TInputKind extends LensArtifactKind, TOutputKind extends LensArtifactKind>(
  input: LensArtifactEnvelope<TInputKind>,
  context: LensTransformContext,
  transform: LensTransform<TInputKind, TOutputKind>,
  payload: LensArtifactPayloadByKind[TOutputKind]
): LensArtifactEnvelope<TOutputKind> {
  return {
    id: context.artifactId,
    kind: transform.outputKind,
    schemaVersion: 1,
    title: context.title ?? input.title,
    createdAt: context.createdAt,
    payload,
    provenance: {
      producedBy: {
        app: context.producedByApp,
        transformId: transform.id,
      },
      sourceArtifacts: [
        {
          id: input.id,
          kind: input.kind,
          title: input.title,
        },
      ],
      sourceScenario: context.sourceScenario ?? input.provenance.sourceScenario,
    },
  };
}

export const decisionModelToRankedOptionsTransform: LensTransform<
  "DecisionModel",
  "RankedOptions"
> = {
  id: "decision-model-to-ranked-options",
  name: "Decision model to ranked options",
  inputKind: "DecisionModel",
  outputKind: "RankedOptions",
  description:
    "Projects a ranked-options artifact from a decision-model artifact that already includes per-option scores.",
  run(input, context) {
    const ranked = [...input.payload.options]
      .filter(
        (option): option is typeof option & { score: number } =>
          !option.excluded && typeof option.score === "number"
      )
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map((option, index) => ({
        optionId: option.id,
        optionName: option.name,
        rank: index + 1,
        score: option.score,
      }));

    const excluded = input.payload.options
      .filter((option) => option.excluded)
      .map((option) => ({
        optionId: option.id,
        optionName: option.name,
        reasons: option.excludedReasons ?? [],
      }));

    return createDerivedArtifact(input, context, decisionModelToRankedOptionsTransform, {
      subject: input.payload.subject,
      ranked,
      excluded,
    });
  },
};

function cloneClaim(claim: ClaimSetArtifact["claims"][number]) {
  return {
    id: claim.id,
    statement: claim.statement,
    category: claim.category,
    notes: claim.notes,
  };
}

function projectExecutionTaskToClaim(
  task: ExecutionPlanArtifact["tasks"][number],
  subject: string
): ClaimSetArtifact["claims"][number] | null {
  if (task.status === "done") {
    return null;
  }

  const notes = [task.notes, ...task.constraintIssues].filter(Boolean).join("\n\n");

  if (task.constraintIssues.length > 0 && task.critical) {
    return {
      id: `claim-${task.id}`,
      statement: `${task.name} is a schedule-critical task with explicit deadline pressure in the current plan for ${subject}.`,
      category: "Critical deadline pressure",
      notes,
    };
  }

  if (task.constraintIssues.length > 0) {
    return {
      id: `claim-${task.id}`,
      statement: `${task.name} is carrying explicit deadline pressure in the current plan for ${subject}.`,
      category: "Deadline pressure",
      notes,
    };
  }

  if (task.critical) {
    return {
      id: `claim-${task.id}`,
      statement: `${task.name} is schedule-critical for delivering ${subject}.`,
      category: "Critical path",
      notes,
    };
  }

  return null;
}

export const executionPlanToClaimSetTransform: LensTransform<"ExecutionPlan", "ClaimSet"> = {
  id: "execution-plan-to-claim-set",
  name: "Execution plan to claim set",
  inputKind: "ExecutionPlan",
  outputKind: "ClaimSet",
  description:
    "Projects only non-done tasks that are schedule-critical or under explicit deadline pressure into claims. It is a narrow planning-pressure transform, not a universal task-to-claim mapping.",
  run(input, context) {
    const claims = input.payload.tasks
      .map((task) => projectExecutionTaskToClaim(task, input.payload.subject))
      .filter((claim): claim is ClaimSetArtifact["claims"][number] => Boolean(claim));

    return createDerivedArtifact(input, context, executionPlanToClaimSetTransform, {
      subject: input.payload.subject,
      claims,
    });
  },
};

export const claimSetToEvidenceMapSeedTransform: LensTransform<"ClaimSet", "EvidenceMap"> = {
  id: "claim-set-to-evidence-map-seed",
  name: "Claim set to evidence map seed",
  inputKind: "ClaimSet",
  outputKind: "EvidenceMap",
  description:
    "Seeds an evidence-map artifact from a claim-set artifact without inventing any sources or links.",
  run(input, context) {
    return createDerivedArtifact(input, context, claimSetToEvidenceMapSeedTransform, {
      subject: input.payload.subject,
      claims: input.payload.claims.map(cloneClaim),
      sources: [],
      links: [],
    });
  },
};

export const lensTransforms: ReadonlyArray<LensTransform<LensArtifactKind, LensArtifactKind>> = [
  decisionModelToRankedOptionsTransform as LensTransform<LensArtifactKind, LensArtifactKind>,
  executionPlanToClaimSetTransform as LensTransform<LensArtifactKind, LensArtifactKind>,
  claimSetToEvidenceMapSeedTransform as LensTransform<LensArtifactKind, LensArtifactKind>,
];

export function getLensTransformById(
  transformId: string
): LensTransform<LensArtifactKind, LensArtifactKind> | undefined {
  return lensTransforms.find((transform) => transform.id === transformId);
}

export function getCompatibleLensTransforms(
  inputKind: LensArtifactKind
): ReadonlyArray<LensTransform<LensArtifactKind, LensArtifactKind>> {
  return lensTransforms.filter((transform) => transform.inputKind === inputKind);
}
