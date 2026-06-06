import { useEffect, useState } from "react";
import { formatIpcError } from "../../shared/ipc/core/error";
import { previewPublishPayload, type PublishPreview } from "../../shared/ipc/publish/preview";
import type { ModelVerdict } from "../../shared/ipc/eval/readiness";
import { WhatsSharedPanel } from "./WhatsSharedPanel";

interface Props {
  verdicts: ModelVerdict[];
  onClose: () => void;
  /// Invoked with the agreed-upon preview — the actual POST is wired in B3.
  onPublish: (preview: PublishPreview) => void;
}

/// The privacy gate: build the exact payload preview in Rust, show the user what
/// will (and won't) leave their machine plus the raw JSON, and require an explicit
/// default-OFF opt-in before Publish enables. Aggregate-only, community-reported.
export function PublishDialog({ verdicts, onClose, onPublish }: Props) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let live = true;
    previewPublishPayload(verdicts)
      .then((p) => live && setPreview(p))
      .catch((e) => live && setError(formatIpcError(e)));
    return () => {
      live = false;
    };
  }, [verdicts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canPublish = !!preview && preview.rows.length > 0 && !preview.invalid && agreed;

  return (
    <div role="presentation" onClick={onClose} data-testid="publish-dialog" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Publish to community board" onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[34rem] max-w-[94vw] p-5 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Publish to community board</h3>
          <span className="text-[11px] text-slate-400">aggregate-only · community-reported · never sold</span>
        </div>

        {error && <div data-testid="publish-error" className="text-xs text-red-600">{error}</div>}

        {preview && (
          <>
            <WhatsSharedPanel />
            <p className="text-xs text-slate-500">
              Publishing <b>{preview.rows.length}</b> model{preview.rows.length === 1 ? "" : "s"} in cohort{" "}
              <code className="text-slate-700">{preview.cohort_key}</code>
              {preview.excluded_count > 0 && <> · {preview.excluded_count} excluded (no measured Pass^k)</>}.
            </p>
            {preview.invalid && (
              <div data-testid="publish-invalid" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Row {preview.invalid.index}: {preview.invalid.reason}
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Exact payload</div>
              <pre data-testid="publish-raw-payload" className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2 max-h-40 overflow-auto text-slate-700 whitespace-pre-wrap break-all">
                {preview.canonical_json}
              </pre>
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" data-testid="publish-optin" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 cursor-pointer" />
              <span>I understand exactly what's shared above and opt in to publishing it.</span>
            </label>
          </>
        )}

        {!preview && !error && <div className="text-xs text-slate-400 py-6 text-center">Building payload preview…</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} data-testid="publish-cancel" className="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="button" disabled={!canPublish} data-testid="publish-confirm" onClick={() => preview && onPublish(preview)} className="px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}
