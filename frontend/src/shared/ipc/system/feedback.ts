export const MIN_MESSAGE_LEN = 10;
export const MAX_MESSAGE_LEN = 5000;
export const FEEDBACK_TO = "info@quantamind.co";
export const FEEDBACK_SUBJECT = "QuantaMind Feedback";
export const APP_VERSION = "0.1.0";

export interface FeedbackInput {
  message: string;
  includeDiagnostics: boolean;
  currentModel?: string | null;
}

function diagnosticsBlock(currentModel?: string | null): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const lines = [
    `App: QuantaMind v${APP_VERSION}`,
    `User-Agent: ${ua}`,
    `Model: ${currentModel ?? "(none selected)"}`,
  ];
  return `\n\n---\nDiagnostics (opt-in)\n${lines.join("\n")}`;
}

export function buildFeedbackMailto(input: FeedbackInput): string {
  const body = input.includeDiagnostics
    ? input.message + diagnosticsBlock(input.currentModel)
    : input.message;
  const params = new URLSearchParams({ subject: FEEDBACK_SUBJECT, body });
  return `mailto:${FEEDBACK_TO}?${params.toString()}`;
}
