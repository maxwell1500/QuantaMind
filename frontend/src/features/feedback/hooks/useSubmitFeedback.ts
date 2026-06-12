import { useCallback, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  buildFeedbackMailto,
  type FeedbackInput,
} from "../../../shared/ipc/system/feedback";
import { formatIpcError } from "../../../shared/ipc/core/error";

export type SubmitStatus = "idle" | "opening" | "success" | "error";

export function useSubmitFeedback() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: FeedbackInput): Promise<boolean> => {
    setError(null);
    setStatus("opening");
    try {
      await openExternal(buildFeedbackMailto(input));
      setStatus("success");
      return true;
    } catch (e) {
      setError(formatIpcError(e));
      setStatus("error");
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, submit, reset };
}
