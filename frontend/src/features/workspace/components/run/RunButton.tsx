import { useRunController } from "../../state/runController";

/// The single Play/Stop control in the header. Reflects and drives whichever
/// run surface (single or multi) is mounted in the Workspace.
export function RunButton() {
  const running = useRunController((s) => s.running);
  const canRun = useRunController((s) => s.canRun);
  const run = useRunController((s) => s.run);
  const stop = useRunController((s) => s.stop);

  if (running) {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Cancel"
        data-testid="run-stop"
        className="text-sm px-2 py-1 rounded border text-gray-700 hover:bg-gray-50"
      >
        ■ Stop
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={!canRun}
      aria-label="Run"
      data-testid="run-play"
      className="text-sm px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
    >
      ▶ Run
    </button>
  );
}
