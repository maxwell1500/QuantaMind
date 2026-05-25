import { invoke } from "@tauri-apps/api/core";

export const MIN_MESSAGE_LEN = 10;
export const MAX_MESSAGE_LEN = 5000;

export interface FeedbackInput {
  message: string;
  userEmail?: string;
  includeDiagnostics: boolean;
  currentModel?: string | null;
}

export async function submitFeedback(input: FeedbackInput): Promise<void> {
  await invoke("submit_feedback", {
    message: input.message,
    userEmail: input.userEmail ?? null,
    includeDiagnostics: input.includeDiagnostics,
    currentModel: input.currentModel ?? null,
  });
}
