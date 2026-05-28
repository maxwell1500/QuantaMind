import { open } from "@tauri-apps/plugin-shell";

type Action = { label: string; onClick: () => void };

type Props = {
  title: string;
  body: string;
  learnMore?: string;
  action?: Action;
};

/// Consistent, actionable error surface: a title, helpful body, an optional
/// primary action (Retry / Open Settings / …), and an optional "Learn more"
/// link that opens the docs in the system browser.
export function ErrorCard({ title, body, learnMore, action }: Props) {
  return (
    <div
      role="alert"
      data-testid="error-card"
      className="border border-red-300 bg-red-50 rounded p-3 text-sm flex flex-col gap-2"
    >
      <div className="font-medium text-red-700">{title}</div>
      <div className="text-gray-700">{body}</div>
      {(action || learnMore) && (
        <div className="flex gap-3 items-center">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="border rounded px-3 py-1 bg-white hover:bg-gray-50"
              data-testid="error-action"
            >
              {action.label}
            </button>
          )}
          {learnMore && (
            <button
              type="button"
              onClick={() => void open(learnMore)}
              className="text-blue-700 hover:underline"
              data-testid="error-learn-more"
            >
              Learn more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
