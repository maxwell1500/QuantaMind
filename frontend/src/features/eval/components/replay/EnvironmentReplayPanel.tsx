import { useEffect, useState } from "react";
import type { TrajectoryStep } from "../../../../shared/ipc/eval/batch";
import { StepScrubber } from "./StepScrubber";
import { FileTreeReplay } from "./FileTreeReplay";
import { CorpusReplay } from "./CorpusReplay";

/// Does this run carry any environment snapshot worth replaying? (Non-env tasks stream
/// `env.kind === "none"` for every step → no panel, zero regression to the text-only trace.)
export function hasEnvReplay(steps: TrajectoryStep[]): boolean {
  return steps.some((s) => s.env != null && s.env.kind !== "none");
}

/// The latest turn that performed a real environment action (so the default view shows the
/// agent's most recent meaningful move, not a terminal no-op turn). `-1` if none.
function latestActionIndex(steps: TrajectoryStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    const env = steps[i]?.env;
    if (env?.kind === "file_system" && env.op !== "none") return i;
    if (env?.kind === "web_corpus" && env.op !== "none") return i;
  }
  return -1;
}

/// The visual environment replay for one run: a step scrubber over the run's turns and the
/// kind-switched environment panel for the selected turn. Follows the live tail (jumps to the
/// newest action as steps stream) until the user scrubs, then stays put.
export function EnvironmentReplayPanel({ steps }: { steps: TrajectoryStep[] }) {
  const [pinned, setPinned] = useState(false);
  const [sel, setSel] = useState(0);

  const action = latestActionIndex(steps);
  const tail = action >= 0 ? action : steps.length - 1;
  useEffect(() => {
    if (!pinned) setSel(tail);
  }, [tail, pinned]);

  const idx = Math.max(0, Math.min(steps.length - 1, sel));
  const env = steps[idx]?.env;

  return (
    <div style={panel} data-testid="env-replay-panel">
      <StepScrubber
        count={steps.length}
        value={idx}
        onChange={(i) => {
          setPinned(true);
          setSel(i);
        }}
      />
      <div style={{ marginTop: 8 }}>
        {env && env.kind === "file_system" ? (
          <FileTreeReplay view={env} />
        ) : env && env.kind === "web_corpus" ? (
          <CorpusReplay view={env} />
        ) : (
          <div style={empty}>no environment action this turn</div>
        )}
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
};
const empty: React.CSSProperties = {
  fontSize: 11,
  color: "#94a3b8",
  fontFamily: "Inter, sans-serif",
  padding: "12px 4px",
};
