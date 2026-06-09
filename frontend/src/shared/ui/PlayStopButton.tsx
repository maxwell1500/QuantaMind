type Props = {
  running: boolean;
  /// A start/stop transition is in flight — shows a spinner and disables.
  busy?: boolean;
  /// Can't start yet (e.g. no model selected). Only gates the play action.
  disabled?: boolean;
  onPlay: () => void;
  onStop: () => void;
  title?: string;
  label?: string;
  playTestId?: string;
  stopTestId?: string;
};

const Play = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const Stop = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);
const Spinner = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" aria-hidden fill="none" stroke="currentColor" strokeWidth="3">
    <circle cx="12" cy="12" r="9" className="opacity-25" />
    <path d="M21 12a9 9 0 0 0-9-9" className="opacity-90" />
  </svg>
);

/// A single play/stop toggle: ▶ when stopped, ⏹ when running, a spinner while
/// starting/stopping. Replaces the per-backend "Start X / Stop X" text buttons.
/// The data-testid follows the action (play vs stop) so existing tests keep
/// keying off `*-start` / `*-stop`.
export function PlayStopButton({
  running,
  busy = false,
  disabled = false,
  onPlay,
  onStop,
  title,
  label = "server",
  playTestId,
  stopTestId,
}: Props) {
  const verb = running ? "Stop" : "Start";
  return (
    <button
      type="button"
      onClick={running ? onStop : onPlay}
      disabled={busy || (!running && disabled)}
      title={title ?? `${verb} ${label}`}
      aria-label={`${verb} ${label}`}
      data-testid={running ? stopTestId : playTestId}
      className={`p-1 rounded hover:bg-gray-100 disabled:opacity-40 ${
        running ? "text-gray-600 hover:text-ink" : "text-blue-600 hover:text-blue-800"
      }`}
    >
      {busy ? <Spinner /> : running ? <Stop /> : <Play />}
    </button>
  );
}
