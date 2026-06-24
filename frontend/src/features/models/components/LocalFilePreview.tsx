import type { GgufMetadata } from "../../../shared/ipc/models/gguf";

type Props = {
  path: string;
  meta: GgufMetadata;
  name: string;
  onNameChange: (v: string) => void;
  onImport: () => void;
  onCancel: () => void;
  busy: boolean;
  percent: number;
  phaseLabel: string | null;
  error: string | null;
  conflict: boolean;
};

const NAME_RE = /^[A-Za-z0-9_\-.:]+$/;

/// Turn a raw import/parse error into plain-language guidance with concrete next steps.
/// Returns null when we have no specific advice (caller shows the message verbatim).
function importGuidance(msg: string): { title: string; steps: string[] } | null {
  const m = msg.toLowerCase();
  if (m.includes("truncated") || m.includes("file too small") || (m.includes("gguf") && m.includes("offset"))) {
    return {
      title: "This GGUF file is incomplete",
      steps: [
        "The download or copy was cut off — this isn't the full model file.",
        "Re-download the complete .gguf, then add it again.",
        "Real models are hundreds of MB to several GB; a tiny file is truncated.",
        "From Hugging Face, get the real .gguf via Git LFS — not a small pointer stub.",
      ],
    };
  }
  if (m.includes("expected magic") || m.includes("not a .gguf") || (m.includes("magic") && m.includes("gguf"))) {
    return {
      title: "This isn't a valid GGUF file",
      steps: [
        "The file doesn't start with the GGUF marker.",
        "Pick a .gguf file — not .safetensors, .bin, or a zip archive.",
        "Re-download from the model source and try again.",
      ],
    };
  }
  if (m.includes("unsupported gguf version")) {
    return {
      title: "Unsupported GGUF version",
      steps: [
        "QuantaMind reads GGUF v1–v3.",
        "Download or re-export a compatible .gguf from the model source.",
      ],
    };
  }
  return null;
}

/// Import errors as actionable guidance, not a raw parser dump — so a bad file reads as
/// "here's how to fix it", never "the app is broken". Unknown errors fall back to the
/// plain message (keeping the same `testid`/alert role the rest of the UI expects).
export function ImportError({ message, testid }: { message: string; testid: string }) {
  const g = importGuidance(message);
  if (!g) {
    return (
      <div role="alert" data-testid={testid} className="text-red-600 text-xs">
        {message}
      </div>
    );
  }
  return (
    <div role="alert" data-testid={testid} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 flex flex-col gap-1">
      <div className="font-semibold">{g.title}</div>
      <ul className="list-disc pl-4 space-y-0.5">
        {g.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="text-[10px] text-amber-700 pt-1 break-all">Details: {message}</div>
    </div>
  );
}

export function LocalFilePreview({
  path, meta, name, onNameChange, onImport, onCancel,
  busy, percent, phaseLabel, error, conflict,
}: Props) {
  const filename = path.split("/").pop() ?? path;
  const nameValid = NAME_RE.test(name) && name.length > 0 && name.length <= 64;
  const params = meta.parameter_count
    ? `${(meta.parameter_count / 1e9).toFixed(1)}B params`
    : "params unknown";
  const ctx = meta.context_length ? `${meta.context_length} ctx` : "ctx unknown";
  const quant = meta.quantization ?? "quant unknown";

  return (
    <div data-testid="local-preview" className="border rounded p-3 flex flex-col gap-2">
      <div className="text-xs text-gray-500">Selected file</div>
      <div className="text-sm font-medium">{filename}</div>
      <div className="text-xs text-gray-700">
        {meta.family || meta.architecture || "unknown family"} · {params} · {ctx} · {quant}
      </div>
      <label className="text-xs text-gray-600 flex flex-col gap-1 mt-1">
        Save as model name
        <input
          aria-label="Model name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
        {!nameValid && (
          <span data-testid="name-invalid" className="text-red-600">
            Use alphanumerics, dot, dash, underscore, colon. Max 64 chars.
          </span>
        )}
        {nameValid && conflict && (
          <span data-testid="name-conflict" className="text-amber-700">
            A model named &quot;{name}&quot; already exists — Import will replace it.
          </span>
        )}
      </label>
      {busy && (
        <div data-testid="import-phase" className="flex items-center gap-2 text-xs">
          <progress value={percent} max={100} className="flex-1 h-2" />
          <span className="tabular-nums w-24 text-right">
            {phaseLabel ? `${phaseLabel} ${percent}%` : `${percent}%`}
          </span>
        </div>
      )}
      {error && <ImportError message={error} testid="import-error" />}
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onImport}
          disabled={!nameValid || busy}
          aria-disabled={!nameValid || busy}
          aria-label={
            !nameValid ? "Import (fix the model name first)"
            : busy ? "Importing — please wait" : "Import"
          }
          className="text-xs border rounded px-2 py-1 bg-blue-600 text-white disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs border rounded px-2 py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
