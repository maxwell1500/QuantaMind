import { useState } from "react";

/// The engine-setup guide, shown when whisper.cpp isn't installed (install) or
/// is present but won't run (reinstall). Calm and actionable — never "the app
/// is broken". Mirrors the ImportError amber-callout tone.
type Props = {
  notRunnable: boolean;
  detail: string | null;
  loading: boolean;
  onRecheck: () => void;
  onChooseFolder: () => void;
};

export function SttSetupCard({ notRunnable, detail, loading, onRecheck, onChooseFolder }: Props) {
  const [copied, setCopied] = useState(false);
  const cmd = notRunnable ? "brew reinstall whisper-cpp" : "brew install whisper-cpp";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the command is shown inline anyway */
    }
  };

  return (
    <div
      data-testid="stt-setup"
      className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded p-4 flex flex-col gap-3 max-w-xl"
    >
      <div className="font-semibold">
        {notRunnable ? "whisper.cpp is installed but can't run" : "Set up speech-to-text"}
      </div>
      <p className="text-xs text-amber-800">
        {notRunnable
          ? "The engine is present but its libraries are missing or mismatched. Reinstall it, then Re-check."
          : "Speech-to-text uses the whisper.cpp engine. Install it once on macOS — QuantaMind then finds it automatically, no path setup needed."}
      </p>
      <ol className="list-decimal pl-5 text-xs flex flex-col gap-1">
        {!notRunnable && (
          <li>
            Install{" "}
            <a className="underline" href="https://brew.sh" target="_blank" rel="noreferrer">
              Homebrew
            </a>{" "}
            if you don't have it.
          </li>
        )}
        <li className="flex items-center gap-2 flex-wrap">
          Run <code className="bg-white/70 border rounded px-1">{cmd}</code>
          <button
            type="button"
            onClick={copy}
            className="text-[11px] border rounded px-1.5 py-0.5"
            data-testid="stt-copy-cmd"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </li>
        <li>
          Click <strong>Re-check</strong>.
        </li>
      </ol>
      {notRunnable && detail && (
        <div className="text-[10px] text-amber-700 break-all whitespace-pre-wrap">
          Details: {detail}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onRecheck}
          disabled={loading}
          className="text-xs border rounded px-3 py-1 bg-blue-600 text-white disabled:opacity-50"
          data-testid="stt-recheck"
        >
          {loading ? "Checking…" : "Re-check"}
        </button>
        <button type="button" onClick={onChooseFolder} className="text-xs underline">
          Installed somewhere else? Choose its folder
        </button>
      </div>
      <p className="text-[10px] text-amber-700">
        If the folder picker fails, choose a folder in your Home directory.
      </p>
    </div>
  );
}
