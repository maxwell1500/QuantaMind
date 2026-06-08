import { useState } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useToast } from "../../shared/ui/Toast";
import { formatIpcError } from "../../shared/ipc/core/error";
import { publishToBoard, startLogin } from "../../shared/ipc/publish/publish";
import type { PublishPreview } from "../../shared/ipc/publish/preview";
import type { ModelVerdict } from "../../shared/ipc/eval/readiness";
import { PublishDialog } from "./PublishDialog";

/// Opens the privacy-gate dialog and handles every publish outcome WITHOUT ever
/// freezing the UI — each server status becomes a toast/next-action. The offline
/// app keeps working regardless of what the board returns.
export function PublishButton({ verdicts }: { verdicts: ModelVerdict[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  /// `retried` guards the auto-publish-after-login path: on first `needs_auth` we
  /// open sign-in then re-attempt once. If it still needs auth (sign-in cancelled
  /// or failed), we stop and ask the user instead of looping forever.
  const onPublish = async (preview: PublishPreview, link: string, retried = false) => {
    try {
      const outcome = await publishToBoard(verdicts, link);
      switch (outcome.kind) {
        case "ok":
          toast("Published to the board ✓");
          setOpen(false);
          void openUrl(outcome.board_url).catch(() => {});
          break;
        case "needs_auth": {
          if (retried) {
            toast("Sign-in didn't complete — Publish again when ready");
            break;
          }
          toast("Sign in in your browser to publish…");
          try {
            await startLogin();
          } catch (e) {
            toast(formatIpcError(e));
            break;
          }
          await onPublish(preview, link, true);
          break;
        }
        case "invalid":
          toast(`Row ${outcome.index} was rejected — adjust it and retry`);
          break;
        case "rate_limited":
          toast("Publishing a lot — try again shortly");
          break;
        case "update_required":
          toast("Please update QuantaMind to publish");
          break;
      }
    } catch (e) {
      toast(`Publish failed — ${formatIpcError(e)}`);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="publish-open"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold py-2 px-4 shadow-sm transition-all cursor-pointer"
      >
        Publish to Board
      </button>
      {open && <PublishDialog verdicts={verdicts} onClose={() => setOpen(false)} onPublish={onPublish} />}
    </>
  );
}
