import type { AnalysisResult, TaskExplanation } from "../domain/types";

interface InspectorPaneProps {
  analysis: AnalysisResult;
  taskExplanation: TaskExplanation | null;
}

function findTaskName(analysis: AnalysisResult, taskId: string): string {
  return analysis.scheduledTaskById[taskId]?.task.name || "Unknown task";
}

export function InspectorPane({ analysis, taskExplanation }: InspectorPaneProps) {
  return (
    <aside className="pane pane--inspector">
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Explanation</p>
            <h2>Why the plan behaves this way</h2>
          </div>
        </div>
        <article className="summary-panel">
          <strong>{analysis.planSummary.headline}</strong>
          <p>{analysis.planSummary.summary}</p>
        </article>

        <div className="inspector-list">
          <article className="summary-panel">
            <span className="eyebrow">Safe to defer</span>
            <ul className="clean-list">
              {analysis.planSummary.safeToDeferIds.length > 0 ? (
                analysis.planSummary.safeToDeferIds.map((taskId) => (
                  <li key={taskId}>{findTaskName(analysis, taskId)}</li>
                ))
              ) : (
                <li>No obvious defer candidates yet.</li>
              )}
            </ul>
          </article>
          <article className="summary-panel">
            <span className="eyebrow">Cut first if needed</span>
            <ul className="clean-list">
              {analysis.planSummary.cutCandidateIds.length > 0 ? (
                analysis.planSummary.cutCandidateIds.map((taskId) => (
                  <li key={taskId}>{findTaskName(analysis, taskId)}</li>
                ))
              ) : (
                <li>No deferrable critical-path work is flagged yet.</li>
              )}
            </ul>
          </article>
        </div>

        {taskExplanation ? (
          <article className="summary-panel summary-panel--task">
            <span className="eyebrow">Selected task</span>
            <strong>{taskExplanation.title}</strong>
            <p>{taskExplanation.summary}</p>
            <div className="summary-panel__section">
              <span className="eyebrow">Risk signals</span>
              <ul className="clean-list">
                {taskExplanation.riskSignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
            <div className="summary-panel__section">
              <span className="eyebrow">Leverage moves</span>
              <ul className="clean-list">
                {taskExplanation.leverageMoves.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ul>
            </div>
            <p>{taskExplanation.slipImpact}</p>
          </article>
        ) : (
          <article className="summary-panel">
            <strong>Select a task</strong>
            <p>The right pane explains the selected task in plain English.</p>
          </article>
        )}
      </section>
    </aside>
  );
}
