import { useState } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useToast } from "../../shared/ui/Toast";
import { formatIpcError } from "../../shared/ipc/core/error";
import { publishToBoard, startLogin } from "../../shared/ipc/publish/publish";
import type { ModelVerdict } from "../../shared/ipc/eval/readiness";
import { PublishDialog } from "./PublishDialog";

/// Opens the privacy-gate dialog and handles every publish outcome WITHOUT ever
/// freezing the UI — each server status becomes a toast/next-action. The offline
/// app keeps working regardless of what the board returns.
export function PublishButton({ verdicts }: { verdicts: ModelVerdict[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const onPublish = async (_preview: unknown, link: string) => {
    try {
      const outcome = await publishToBoard(verdicts, link);
      switch (outcome.kind) {
        case "ok":
          toast("Published to the board ✓");
          setOpen(false);
          void openUrl(outcome.board_url).catch(() => {});
          break;
        case "needs_auth":
          toast("Sign in in your browser, then Publish again");
          void startLogin().catch((e) => toast(formatIpcError(e)));
          break;
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
