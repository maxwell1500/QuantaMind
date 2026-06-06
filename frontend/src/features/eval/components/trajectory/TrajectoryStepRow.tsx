import type { StepKind, TrajectoryStep } from "../../../../shared/ipc/eval/batch";

const KIND_META: Record<StepKind, { label: string; color: string }> = {
  tool_call: { label: "Tool Call", color: "#93c5fd" },
  tool_error: { label: "Tool Error (injected)", color: "#fca5a5" },
  unknown_tool: { label: "Unknown Tool", color: "#fca5a5" },
  schema_error: { label: "Schema Error", color: "#fbbf24" },
  malformed_json: { label: "Malformed JSON", color: "#fca5a5" },
  hallucinated_completion: { label: "Hallucinated Done", color: "#fca5a5" },
  end_state_reached: { label: "End State Reached", color: "#4ade80" },
  infinite_loop: { label: "Loop Cap Hit", color: "#fca5a5" },
};

const code: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#e2e8f0",
  fontFamily: "'JetBrains Mono','Fira Code',monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

/// One turn in the trajectory timeline. Error kinds (unknown tool / malformed /
/// hallucinated / loop cap) draw a high-contrast red rail; the end state is green.
export function TrajectoryStepRow({ step }: { step: TrajectoryStep }) {
  const meta = KIND_META[step.kind];
  return (
    <div data-testid={`trajectory-step-${step.kind}`} style={{ borderLeft: `2px solid ${meta.color}`, paddingLeft: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: meta.color, fontFamily: "Inter,sans-serif" }}>
        STEP {step.step_index + 1} · {meta.label}
      </div>
      {step.raw_output && <pre style={code}>{step.raw_output}</pre>}
      {step.injection && (
        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace", marginTop: 3 }}>↳ {step.injection}</div>
      )}
    </div>
  );
}
