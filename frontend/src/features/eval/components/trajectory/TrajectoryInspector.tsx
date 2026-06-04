import type { AgenticReport, TrajectoryStep } from "../../../../shared/ipc/eval/batch";
import { TrajectoryStepRow } from "./TrajectoryStepRow";
import { metricTitle } from "../../help";

const TOP_ERROR_LABEL: Record<string, string> = {
  none: "None",
  infinite_loop: "Loop Cap",
  hallucinated: "Fake Done",
  malformed_json: "Malformed",
};

const stat = (label: string, value: string, tip?: string) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: 10, color: "#64748b", fontFamily: "Inter,sans-serif" }} title={tip}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif" }}>{value}</div>
  </div>
);

const fmt = (n: number | null) => (n == null ? "N/A" : (Math.round(n * 10) / 10).toString());

/// The agentic trace view: a Pass^k header + the live vertical turn timeline. The
/// effort/steps render "N/A" when the engine reported none — never fabricated.
export function TrajectoryInspector({ steps, report }: { steps: TrajectoryStep[]; report?: AgenticReport | null }) {
  return (
    <div data-testid="trajectory-inspector">
      {report && (
        <div style={{ display: "flex", gap: 24, justifyContent: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 }}>
          {stat("Pass^k", `${report.passes}/${report.total_runs}`, metricTitle("passK"))}
          {stat("Avg Steps", fmt(report.avg_steps), metricTitle("avgSteps"))}
          {stat("Effort", report.avg_output_tokens_success == null ? "N/A" : `${Math.round(report.avg_output_tokens_success)} tok`, metricTitle("effort"))}
          {stat("Top Error", TOP_ERROR_LABEL[report.top_error] ?? report.top_error, metricTitle("topError"))}
        </div>
      )}
      {steps.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter,sans-serif" }}>No turns recorded yet.</div>
      ) : (
        steps.map((s, i) => <TrajectoryStepRow key={`${s.run_index}-${s.step_index}-${i}`} step={s} />)
      )}
    </div>
  );
}
