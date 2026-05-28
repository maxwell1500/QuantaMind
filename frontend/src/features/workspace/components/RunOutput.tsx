import { OutputStream } from "./OutputStream";
import { WorkspaceError } from "./WorkspaceError";
import { formatMetrics } from "../format";
import type { RunStatus } from "../hooks/useStreamingRun";
import type { CancelledPayload, DonePayload } from "../../../shared/ipc/events";

type Props = {
  output: string;
  status: RunStatus;
  metrics: DonePayload | null;
  cancelledInfo: CancelledPayload | null;
  error: string | null;
  onRetry: () => void;
};

export function RunOutput({ output, status, metrics, cancelledInfo, error, onRetry }: Props) {
  return (
    <>
      <OutputStream output={output} loading={status === "running" && !output} />
      {metrics && (
        <p className="text-xs text-gray-600" data-testid="metrics">
          {formatMetrics(metrics)}
        </p>
      )}
      {cancelledInfo && (
        <p className="text-xs text-amber-700" data-testid="cancelled-info">
          Cancelled · {cancelledInfo.token_count} tokens
        </p>
      )}
      {error && <WorkspaceError error={error} onRetry={onRetry} />}
    </>
  );
}
