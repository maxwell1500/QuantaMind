import type { HfRepoEntry, HfVariant } from "../data/huggingface-catalog";
import { useHfInstall } from "../hooks/useHfInstall";
import { formatBytes } from "../format";

type Props = { entry: HfRepoEntry; onBack: () => void };

export function HuggingFaceRepoDetail({ entry, onBack }: Props) {
  const { state, install, reset } = useHfInstall();
  const busy = state.status === "downloading" || state.status === "installing";

  const handleInstall = (v: HfVariant) => {
    const safe = v.filename.replace(/\.gguf$/i, "").toLowerCase();
    void install(entry.repo, v.filename, safe);
  };

  return (
    <div data-testid="hf-repo-detail" className="flex flex-col gap-3 h-full">
      <button type="button" onClick={onBack} className="self-start text-xs underline">
        ← Back to search
      </button>
      <div>
        <div className="text-sm font-medium">{entry.baseModel}</div>
        <div className="text-xs text-gray-500">{entry.repo} · {entry.license}</div>
        <div className="text-xs text-gray-700 mt-1">{entry.description}</div>
      </div>
      <table className="text-xs w-full border-collapse" data-testid="variant-table">
        <thead>
          <tr className="text-left text-gray-500"><th>Filename</th><th>Quant</th><th>Size</th><th>Quality</th><th></th></tr>
        </thead>
        <tbody>
          {entry.variants.map((v) => (
            <tr key={v.filename} className="border-t" data-testid={`variant-${v.quantization}`}>
              <td className="py-1 pr-2">{v.filename}</td>
              <td className="py-1 pr-2">{v.quantization}</td>
              <td className="py-1 pr-2">{formatBytes(v.sizeBytes)}</td>
              <td className="py-1 pr-2 text-gray-600">{v.quality}</td>
              <td className="py-1">
                <button type="button" disabled={busy} onClick={() => handleInstall(v)}
                  className="text-xs border rounded px-2 py-1 disabled:opacity-50">
                  {busy ? "…" : "Install"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.status === "downloading" && (
        <div className="text-xs" data-testid="hf-downloading">
          Downloading · {state.percent}%
        </div>
      )}
      {state.status === "installing" && (
        <div className="text-xs" data-testid="hf-installing">Installing into Ollama…</div>
      )}
      {state.status === "error" && (
        <div role="alert" className="text-red-600 text-xs" data-testid="hf-error">
          {state.error} <button type="button" onClick={reset} className="ml-2 underline">dismiss</button>
        </div>
      )}
    </div>
  );
}
