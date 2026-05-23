import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { HfRepoEntry, HfVariant } from "../data/huggingface-catalog";
import { useHfInstall } from "../hooks/useHfInstall";
import { formatBytes } from "../format";
import { listModels } from "../../../shared/ipc/client";

type Props = { entry: HfRepoEntry; onBack: () => void };

const EVENT_MODELS_CHANGED = "models-changed";
const variantName = (v: HfVariant) => v.filename.replace(/\.gguf$/i, "").toLowerCase();
const bareName = (n: string) => n.split(":")[0];

export function HuggingFaceRepoDetail({ entry, onBack }: Props) {
  const { state, install, cancel, reset } = useHfInstall();
  const busy = state.status === "downloading" || state.status === "installing";
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const refresh = () => listModels()
      .then((list) => { if (!cancelled) setInstalled(new Set(list.map(bareName))); })
      .catch(() => {});
    refresh();
    (async () => {
      const u = await listen(EVENT_MODELS_CHANGED, () => refresh());
      if (cancelled) u(); else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const handleInstall = (v: HfVariant) => void install(entry.repo, v.filename, variantName(v));

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
          {entry.variants.map((v) => {
            const isInstalled = installed.has(variantName(v));
            return (
              <tr key={v.filename} className="border-t" data-testid={`variant-${v.quantization}`}>
                <td className="py-1 pr-2">{v.filename}</td>
                <td className="py-1 pr-2">{v.quantization}</td>
                <td className="py-1 pr-2">{formatBytes(v.sizeBytes)}</td>
                <td className="py-1 pr-2 text-gray-600">{v.quality}</td>
                <td className="py-1">
                  {isInstalled ? (
                    <span className="text-xs text-green-600" data-testid={`variant-installed-${v.quantization}`}>
                      Installed ✓
                    </span>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => handleInstall(v)}
                      className="text-xs border rounded px-2 py-1 disabled:opacity-50">
                      {busy ? "…" : "Install"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.status === "downloading" && (
        <div data-testid="hf-downloading" className="flex items-center gap-2">
          <progress value={state.percent} max={100} className="flex-1 h-2" />
          <span className="text-xs tabular-nums w-10 text-right">{state.percent}%</span>
          <button type="button" onClick={cancel} className="text-xs border rounded px-2 py-1">
            Cancel
          </button>
        </div>
      )}
      {state.status === "installing" && (
        <div data-testid="hf-installing" className="text-xs">
          Installing into Ollama…
        </div>
      )}
      {state.status === "error" && (
        <div role="alert" className="text-red-600 text-xs" data-testid="hf-error">
          {state.error} <button type="button" onClick={reset} className="ml-2 underline">dismiss</button>
        </div>
      )}
    </div>
  );
}
