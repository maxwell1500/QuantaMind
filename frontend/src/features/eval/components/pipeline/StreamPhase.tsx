/// Phase 3 — Stream: the model's REAL raw completion (a terminal view). This is
/// what the model actually emitted, not a reconstruction of the expected answer.
export function StreamPhase({ output, running }: { output: string; running: boolean }) {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: 16,
        minHeight: 160,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
      data-testid="pipeline-stream"
    >
      <div style={{ fontSize: 11, color: "#22d3ee", letterSpacing: "0.08em", marginBottom: 10 }}>
        &gt; INFERENCE STREAM
      </div>
      <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#e2e8f0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {output || (running ? "" : "—")}
        {running && <span style={{ color: "#22d3ee" }}>▋</span>}
      </pre>
    </div>
  );
}
