import type { GgufMetadata } from "../../../shared/ipc/gguf";

type Props = {
  path: string;
  meta: GgufMetadata;
  name: string;
  onNameChange: (v: string) => void;
  onImport: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  conflict: boolean;
};

const NAME_RE = /^[A-Za-z0-9_\-.:]+$/;

export function LocalFilePreview({
  path, meta, name, onNameChange, onImport, onCancel, busy, error, conflict,
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
      {error && (
        <div role="alert" className="text-red-600 text-xs" data-testid="import-error">
          {error}
        </div>
      )}
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onImport}
          disabled={!nameValid || busy}
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
