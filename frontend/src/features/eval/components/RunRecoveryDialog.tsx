import { useEffect } from "react";
import type { UnfinishedRun } from "../../../shared/ipc/eval/queue";

/// Crash-recovery prompt: an interrupted run was found — Resume from where it left
/// off (primary, keeps data) or Discard it (destructive). Backdrop / Escape just
/// dismisses (keeps the log for next launch). Matches the app's modal pattern.
export function RunRecoveryDialog({
  run,
  onResume,
  onDiscard,
  onDismiss,
}: {
  run: UnfinishedRun;
  onResume: () => void;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="presentation"
      onClick={onDismiss}
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      data-testid="run-recovery-dialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resume interrupted evaluation"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg shadow-xl w-96 max-w-[90vw] p-5 space-y-3 border border-gray-100"
      >
        <h3 className="text-sm font-semibold text-gray-900">Resume interrupted evaluation?</h3>
        <p className="text-sm text-gray-600">
          An evaluation of “{run.collection_id}” was interrupted — <b>{run.done}/{run.total}</b> tasks
          completed. Resume where it left off, or discard the saved progress?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            data-testid="recovery-discard"
            className="px-3 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onResume}
            data-testid="recovery-resume"
            className="px-3 py-1.5 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-500"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}
