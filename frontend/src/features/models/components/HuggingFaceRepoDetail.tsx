import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useHfInstall } from "../hooks/useHfInstall";
import { useHfRepoVariants, type HfVariantView } from "../hooks/useHfRepoVariants";
import { hfVariantModelName } from "../format";
import { classifyHfVariant } from "../classify_variant";
import { formatBytes } from "../../../shared/format/bytes";
import { listModels } from "../../../shared/ipc/client";
import { formatIpcError } from "../../../shared/ipc/error";

type Props = { repo: string; onBack: () => void };

const EVENT_MODELS_CHANGED = "models-changed";
const variantName = (v: HfVariantView) =>
  hfVariantModelName(v.filename, v.quantization === "unknown" ? undefined : v.quantization);

export function HuggingFaceRepoDetail({ repo, onBack }: Props) {
  const { state, install, cancel, reset } = useHfInstall();
  const { variants, status: loadStatus, error: loadError, refetch } = useHfRepoVariants(repo);
  const busy = state.status === "downloading" || state.status === "installing";
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const refresh = () => listModels()
      .then((list) => { if (!cancelled) setInstalled(new Set(list)); })
      .catch((e) => console.error("HuggingFaceRepoDetail: listModels failed —", formatIpcError(e)));
    refresh();
    (async () => {
      try {
        const u = await listen(EVENT_MODELS_CHANGED, () => refresh());
        if (cancelled) u(); else unsub = u;
      } catch (e) {
        console.error("HuggingFaceRepoDetail: listen(models-changed) failed —", formatIpcError(e));
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const handleInstall = (v: HfVariantView) => void install(repo, v.filename, variantName(v));

  return (
    <div data-testid="hf-repo-detail" className="flex flex-col gap-3 h-full">
      <button type="button" onClick={onBack} className="self-start text-xs underline">← Back to search</button>
      <div className="text-sm font-medium break-all">{repo}</div>
      {loadStatus === "loading" && (
        <div data-testid="hf-detail-loading" className="text-xs text-gray-500">Loading variants…</div>
      )}
      {loadStatus === "error" && (
        <div role="alert" data-testid="hf-detail-error" className="text-xs text-red-600">
          {loadError}
          <button type="button" onClick={refetch} className="ml-2 underline">Retry</button>
        </div>
      )}
      {loadStatus === "ready" && variants.length === 0 && (
        <div data-testid="hf-detail-empty" className="text-xs text-gray-500">No .gguf files in this repo.</div>
      )}
      {loadStatus === "ready" && variants.length > 0 && (
        <table className="text-xs w-full border-collapse" data-testid="variant-table">
          <thead><tr className="text-left text-gray-500"><th>Filename</th><th>Quant</th><th>Size</th><th></th></tr></thead>
          <tbody>
            {variants.map((v) => {
              const isInstalled = installed.has(variantName(v));
              const klass = classifyHfVariant(v.filename);
              const blocked = klass.kind !== "model";
              return (
                <tr key={v.filename} className="border-t" data-testid={`variant-${v.quantization}`}>
                  <td className="py-1 pr-2 break-all">{v.filename}</td>
                  <td className="py-1 pr-2">{v.quantization}</td>
                  <td className="py-1 pr-2">{formatBytes(v.sizeBytes)}</td>
                  <td className="py-1">
                    {isInstalled ? (
                      <span className="text-xs text-green-600" data-testid={`variant-installed-${v.quantization}`}>Installed ✓</span>
                    ) : blocked ? (
                      <span
                        className="text-xs text-amber-700"
                        title={klass.reason}
                        data-testid={`variant-blocked-${v.quantization}`}
                      >
                        {klass.label} · Not supported
                      </span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => handleInstall(v)} className="text-xs border rounded px-2 py-1 disabled:opacity-50">
                        {busy ? "…" : "Install"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {state.status === "downloading" && (
        <div data-testid="hf-downloading" className="flex items-center gap-2">
          <progress value={state.percent} max={100} className="flex-1 h-2" />
          <span className="text-xs tabular-nums w-10 text-right">{state.percent}%</span>
          <button type="button" onClick={cancel} className="text-xs border rounded px-2 py-1">Cancel</button>
        </div>
      )}
      {state.status === "installing" && (
        <div data-testid="hf-installing" className="text-xs">Installing into Ollama…</div>
      )}
      {state.status === "error" && (
        <div role="alert" className="text-red-600 text-xs" data-testid="hf-error">
          {state.error} <button type="button" onClick={reset} className="ml-2 underline">dismiss</button>
        </div>
      )}
    </div>
  );
}
