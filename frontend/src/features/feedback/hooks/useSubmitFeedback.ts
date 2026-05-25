import { useCallback, useState } from "react";
import {
  submitFeedback,
  type FeedbackInput,
} from "../../../shared/ipc/feedback";
import { formatIpcError } from "../../../shared/ipc/error";

export type SubmitStatus = "idle" | "submitting" | "success" | "error";

export function useSubmitFeedback() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: FeedbackInput): Promise<boolean> => {
    setError(null);
    setStatus("submitting");
    try {
      await submitFeedback(input);
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
