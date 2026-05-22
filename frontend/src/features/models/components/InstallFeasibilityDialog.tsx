import type { InstallFeasibility } from "../../../shared/ipc/feasibility";
import { formatBytes } from "../format";

type Props = {
  feasibility: InstallFeasibility;
  modelName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function InstallFeasibilityDialog({
  feasibility,
  modelName,
  onConfirm,
  onCancel,
}: Props) {
  if (feasibility.kind === "ok") return null;

  const blocked = feasibility.kind === "blocked_insufficient_space";

  return (
    <div
      role="alertdialog"
      data-testid="feasibility-dialog"
      data-kind={feasibility.kind}
      className="border rounded p-3 bg-amber-50 mt-1"
    >
      {blocked ? (
        <p className="text-xs text-red-800">
          Not enough disk space for <strong>{modelName}</strong>. Needs{" "}
          {formatBytes(feasibility.needed_bytes)} but only{" "}
          {formatBytes(feasibility.free_bytes)} free. Free up space and try again.
        </p>
      ) : (
        <p className="text-xs">
          Installing <strong>{modelName}</strong> will leave{" "}
          {formatBytes(feasibility.free_after_bytes)} free. Continue?
        </p>
      )}
      <div className="flex gap-2 mt-2">
        {!blocked && (
          <button
            type="button"
            onClick={onConfirm}
            className="text-xs border rounded px-2 py-1 bg-blue-600 text-white"
          >
            Continue
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-xs border rounded px-2 py-1"
        >
          {blocked ? "OK" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
