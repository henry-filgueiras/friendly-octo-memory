import { formatPoints, formatSourceType, formatVerdict } from "../domain/helpers";
import type { AnalysisResult, ClaimExplanation } from "../domain/types";

interface InspectorPaneProps {
  analysis: AnalysisResult;
  claimExplanation: ClaimExplanation | null;
  selectedClaimId: string | null;
}

export function InspectorPane({
  analysis,
  claimExplanation,
  selectedClaimId,
}: InspectorPaneProps) {
  const selectedAssessment = selectedClaimId
    ? analysis.claimAssessmentById[selectedClaimId] ?? null
    : null;

  return (
    <section className="panel panel--inspector">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Explanation</p>
          <h2>Why this claim looks the way it does</h2>
        </div>
      </div>

      {!selectedAssessment || !claimExplanation ? (
        <div className="empty-state">
          <h3>Pick a claim to inspect.</h3>
          <p>The explanation pane translates the scoring model back into plain English.</p>
        </div>
      ) : (
        <div className="inspector-stack">
          <div className="inspector-card">
            <span className={`verdict-chip verdict-chip--${selectedAssessment.verdict}`}>
              {formatVerdict(selectedAssessment.verdict)}
            </span>
            <h3>{claimExplanation.title}</h3>
            <p>{claimExplanation.summary}</p>
          </div>

          <div className="inspector-card">
            <p className="eyebrow">Helped most</p>
            <ul className="inspector-list">
              {claimExplanation.helps.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>

          <div className="inspector-card">
            <p className="eyebrow">Hurt most</p>
            <ul className="inspector-list">
              {claimExplanation.hurts.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>

          <div className="inspector-card">
            <p className="eyebrow">Next evidence</p>
            <ul className="inspector-list">
              {claimExplanation.nextEvidence.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>

          <div className="inspector-card">
            <p className="eyebrow">Source influence</p>
            <div className="source-stack">
              {analysis.sourceAssessments.slice(0, 4).map((sourceAssessment) => (
                <div key={sourceAssessment.source.id} className="source-card">
                  <div>
                    <strong>{sourceAssessment.source.title}</strong>
                    <small>{formatSourceType(sourceAssessment.source.type)}</small>
                  </div>
                  <div className="source-card__meta">
                    <span>{formatPoints(sourceAssessment.impactScore)}</span>
                    <span>{sourceAssessment.uniqueClaimCount} claims</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
