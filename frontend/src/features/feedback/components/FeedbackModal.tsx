import { useEffect, useState } from "react";
import { useSubmitFeedback } from "../hooks/useSubmitFeedback";
import { useToast } from "../../../shared/ui/Toast";
import { useWorkspaceStore } from "../../workspace/state/workspaceStore";
import { MIN_MESSAGE_LEN, MAX_MESSAGE_LEN } from "../../../shared/ipc/feedback";

type Props = { onClose: () => void };

export function FeedbackModal({ onClose }: Props) {
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const { status, error, submit, reset } = useSubmitFeedback();
  const showToast = useToast();
  const currentModel = useWorkspaceStore((s) => s.selectedModel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "opening") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  const trimmedLen = message.trim().length;
  const canSend = trimmedLen >= MIN_MESSAGE_LEN
    && trimmedLen <= MAX_MESSAGE_LEN && status !== "opening";

  const send = async () => {
    const ok = await submit({
      message, includeDiagnostics,
      currentModel: includeDiagnostics ? currentModel : null,
    });
    if (ok) { showToast("Opened your mail app — review and hit Send."); onClose(); }
  };

  return (
    <div role="presentation" onClick={onClose}
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-3"
        data-testid="feedback-modal">
        <h2 id="feedback-title" className="text-lg font-semibold">Send us feedback</h2>
        <p className="text-sm text-gray-600">
          QuantaMind is early. Honest feedback — what's broken, what's missing,
          what you wish worked differently — directly shapes what we build next.
        </p>
        <textarea aria-label="Feedback message" data-testid="feedback-message"
          rows={6} maxLength={MAX_MESSAGE_LEN} value={message}
          onChange={(e) => { setMessage(e.target.value); if (status === "error") reset(); }}
          className="w-full border rounded p-2 text-sm font-sans"
          placeholder="What's working, what's broken, what's missing?" />
        <div
          data-testid="feedback-char-counter"
          className={`text-[11px] text-right ${trimmedLen < MIN_MESSAGE_LEN ? "text-red-600 font-medium" : "text-gray-500"}`}
        >
          {trimmedLen < MIN_MESSAGE_LEN
            ? `${trimmedLen} / ${MIN_MESSAGE_LEN} minimum characters`
            : `${trimmedLen} / ${MAX_MESSAGE_LEN}`}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" data-testid="feedback-diagnostics"
            checked={includeDiagnostics}
            onChange={(e) => setIncludeDiagnostics(e.target.checked)} />
          Include diagnostic info (app version, OS, current model)
        </label>
        <p className="text-[11px] text-gray-500">
          Click <strong>Open in mail app</strong> and your default email client
          opens a draft to <strong>info@quantamind.co</strong> with this message
          pre-filled. You hit Send from there. We read every message.
        </p>
        {status === "error" && (
          <div role="alert" data-testid="feedback-error" className="text-xs text-red-600">
            Couldn't open your mail app: {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={status === "opening"}
            className="border rounded px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-60"
            data-testid="feedback-cancel">
            Cancel
          </button>
          <button type="button" onClick={() => void send()} disabled={!canSend}
            className="rounded px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            data-testid="feedback-send">
            {status === "opening" ? "Opening…" : "Open in mail app"}
          </button>
        </div>
      </div>
    </div>
  );
}
