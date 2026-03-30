import { Fragment } from "react";
import type { RefObject } from "react";
import { formatPoints, formatSourceType, formatVerdict } from "../domain/helpers";
import type { AnalysisResult, ClaimAssessment, MatrixCell } from "../domain/types";

export type AnalysisView = "claims" | "contested" | "gaps" | "matrix";

interface AnalysisPaneProps {
  analysis: AnalysisResult;
  analysisView: AnalysisView;
  isGuidedDemoFocused: boolean;
  paneRef: RefObject<HTMLElement>;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
  onSetAnalysisView: (view: AnalysisView) => void;
}

function ClaimCard({
  assessment,
  selectedClaimId,
  onSelectClaim,
}: {
  assessment: ClaimAssessment;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}) {
  const total = Math.max(
    assessment.supportScore + assessment.contradictionScore + assessment.mentionScore,
    1
  );

  return (
    <button
      type="button"
      className={`analysis-card ${selectedClaimId === assessment.claim.id ? "analysis-card--selected" : ""}`}
      onClick={() => onSelectClaim(assessment.claim.id)}
    >
      <div className="analysis-card__header">
        <div>
          <p className="analysis-card__eyebrow">{assessment.claim.category}</p>
          <h3>{assessment.claim.statement}</h3>
        </div>
        <span className={`verdict-chip verdict-chip--${assessment.verdict}`}>
          {formatVerdict(assessment.verdict)}
        </span>
      </div>
      <p className="analysis-card__meta">
        Importance {assessment.claim.importance}/5 • {assessment.uniqueSourceCount} sources • certainty{" "}
        {assessment.certaintyScore.toFixed(0)}/100
      </p>
      <div className="score-rail">
        <span
          className="score-rail__segment score-rail__segment--support"
          style={{ width: `${(assessment.supportScore / total) * 100}%` }}
        />
        <span
          className="score-rail__segment score-rail__segment--contradiction"
          style={{ width: `${(assessment.contradictionScore / total) * 100}%` }}
        />
        <span
          className="score-rail__segment score-rail__segment--mention"
          style={{ width: `${(assessment.mentionScore / total) * 100}%` }}
        />
      </div>
      <div className="metric-row">
        <span>Support {formatPoints(assessment.supportScore)}</span>
        <span>Contradiction {formatPoints(assessment.contradictionScore)}</span>
        <span>Mentions {formatPoints(assessment.mentionScore)}</span>
      </div>
    </button>
  );
}

function ClaimsView(props: {
  analysis: AnalysisResult;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}) {
  if (props.analysis.claimAssessments.length === 0) {
    return <p className="empty-copy">Load a demo or add claims and sources to generate analysis.</p>;
  }

  return (
    <div className="analysis-stack">
      {props.analysis.claimAssessments.map((assessment) => (
        <ClaimCard
          key={assessment.claim.id}
          assessment={assessment}
          selectedClaimId={props.selectedClaimId}
          onSelectClaim={props.onSelectClaim}
        />
      ))}
    </div>
  );
}

function ContestedView(props: {
  analysis: AnalysisResult;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}) {
  if (props.analysis.contestedClaims.length === 0) {
    return <p className="empty-copy">No deeply contested claims yet. That can mean consensus, or just missing contradiction.</p>;
  }

  return (
    <div className="analysis-stack">
      {props.analysis.contestedClaims.map((assessment) => (
        <ClaimCard
          key={assessment.claim.id}
          assessment={assessment}
          selectedClaimId={props.selectedClaimId}
          onSelectClaim={props.onSelectClaim}
        />
      ))}
    </div>
  );
}

function GapsView(props: {
  analysis: AnalysisResult;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}) {
  if (props.analysis.gapClaims.length === 0) {
    return <p className="empty-copy">No major evidence gaps surfaced.</p>;
  }

  return (
    <div className="analysis-stack">
      {props.analysis.gapClaims.map((assessment) => (
        <ClaimCard
          key={assessment.claim.id}
          assessment={assessment}
          selectedClaimId={props.selectedClaimId}
          onSelectClaim={props.onSelectClaim}
        />
      ))}
    </div>
  );
}

function getMatrixCell(
  matrix: MatrixCell[],
  claimId: string,
  sourceId: string
): MatrixCell | undefined {
  return matrix.find((cell) => cell.claimId === claimId && cell.sourceId === sourceId);
}

function MatrixView({ analysis, selectedClaimId, onSelectClaim }: {
  analysis: AnalysisResult;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}) {
  if (analysis.claimAssessments.length === 0 || analysis.sourceAssessments.length === 0) {
    return <p className="empty-copy">The matrix appears once there is at least one claim and one source.</p>;
  }

  return (
    <div className="matrix-shell">
      <div
        className="matrix-grid"
        style={{
          gridTemplateColumns: `220px repeat(${analysis.claimAssessments.length}, minmax(180px, 1fr))`,
        }}
      >
        <div className="matrix-header-cell matrix-header-cell--corner">Sources vs claims</div>
        {analysis.claimAssessments.map((assessment) => (
          <button
            type="button"
            key={assessment.claim.id}
            className={`matrix-header-cell ${selectedClaimId === assessment.claim.id ? "matrix-header-cell--selected" : ""}`}
            onClick={() => onSelectClaim(assessment.claim.id)}
          >
            <span>{assessment.claim.statement}</span>
          </button>
        ))}
        {analysis.sourceAssessments.map((sourceAssessment) => (
          <Fragment key={sourceAssessment.source.id}>
            <div className="matrix-source-cell">
              <strong>{sourceAssessment.source.title}</strong>
              <small>{formatSourceType(sourceAssessment.source.type)}</small>
            </div>
            {analysis.claimAssessments.map((claimAssessment) => {
              const cell = getMatrixCell(
                analysis.matrix,
                claimAssessment.claim.id,
                sourceAssessment.source.id
              );
              return (
                <div
                  key={`${sourceAssessment.source.id}-${claimAssessment.claim.id}`}
                  className={`matrix-cell matrix-cell--${cell?.stance ?? "empty"}`}
                >
                  {cell?.label ? <strong>{cell.label}</strong> : <span>·</span>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function AnalysisPane({
  analysis,
  analysisView,
  isGuidedDemoFocused,
  paneRef,
  selectedClaimId,
  onSelectClaim,
  onSetAnalysisView,
}: AnalysisPaneProps) {
  const leadClaim = analysis.summary.leadClaimId
    ? analysis.claimAssessmentById[analysis.summary.leadClaimId]
    : null;

  return (
    <section
      ref={paneRef}
      className={`panel panel--analysis ${isGuidedDemoFocused ? "panel-guided-focus" : ""}`}
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Analysis</p>
          <h2>Evidence pressure and gaps</h2>
        </div>
        <div className="stat-row">
          <div className="mini-stat">
            <span>Lead claim</span>
            <strong>{leadClaim?.claim.statement ?? "None"}</strong>
          </div>
          <div className="mini-stat">
            <span>Claims</span>
            <strong>{analysis.summary.claimCount}</strong>
          </div>
          <div className="mini-stat">
            <span>Contested</span>
            <strong>{analysis.summary.contestedCount}</strong>
          </div>
          <div className="mini-stat">
            <span>Open/thin</span>
            <strong>{analysis.summary.openCount}</strong>
          </div>
        </div>
      </div>

      {isGuidedDemoFocused ? (
        <div className="analysis-focus-badge">
          <span className="analysis-focus-badge__dot" aria-hidden="true" />
          Guided demo focus: watch this pane
        </div>
      ) : null}

      <div className="tab-row">
        <button
          type="button"
          className={`tab-button ${analysisView === "claims" ? "tab-button--active" : ""}`}
          onClick={() => onSetAnalysisView("claims")}
        >
          Claims
        </button>
        <button
          type="button"
          className={`tab-button ${analysisView === "contested" ? "tab-button--active" : ""}`}
          onClick={() => onSetAnalysisView("contested")}
        >
          Contested
        </button>
        <button
          type="button"
          className={`tab-button ${analysisView === "gaps" ? "tab-button--active" : ""}`}
          onClick={() => onSetAnalysisView("gaps")}
        >
          Gaps
        </button>
        <button
          type="button"
          className={`tab-button ${analysisView === "matrix" ? "tab-button--active" : ""}`}
          onClick={() => onSetAnalysisView("matrix")}
        >
          Matrix
        </button>
      </div>

      {analysisView === "claims" ? (
        <ClaimsView
          analysis={analysis}
          selectedClaimId={selectedClaimId}
          onSelectClaim={onSelectClaim}
        />
      ) : null}
      {analysisView === "contested" ? (
        <ContestedView
          analysis={analysis}
          selectedClaimId={selectedClaimId}
          onSelectClaim={onSelectClaim}
        />
      ) : null}
      {analysisView === "gaps" ? (
        <GapsView
          analysis={analysis}
          selectedClaimId={selectedClaimId}
          onSelectClaim={onSelectClaim}
        />
      ) : null}
      {analysisView === "matrix" ? (
        <MatrixView
          analysis={analysis}
          selectedClaimId={selectedClaimId}
          onSelectClaim={onSelectClaim}
        />
      ) : null}
    </section>
  );
}
