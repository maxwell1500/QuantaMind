import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useHfInstall } from "../hooks/useHfInstall";
import { useHfRepoVariants, type HfVariantView } from "../hooks/useHfRepoVariants";
import { hfVariantModelName } from "../format";
import { listModels } from "../../../shared/ipc/client";
import { formatIpcError } from "../../../shared/ipc/error";
import { HfVariantTable } from "./HfVariantTable";
import { HfInstallStatus } from "./HfInstallStatus";

type Props = { repo: string; onBack: () => void };

const EVENT_MODELS_CHANGED = "models-changed";
const variantName = (v: HfVariantView) =>
  hfVariantModelName(v.filename, v.quantization === "unknown" ? undefined : v.quantization);

export function HuggingFaceRepoDetail({ repo, onBack }: Props) {
  const { state, install, cancel, reset } = useHfInstall();
  const { variants, status: loadStatus, error: loadError, refetch } =
    useHfRepoVariants(repo);
  const busy = state.status === "downloading" || state.status === "installing";
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const refresh = () =>
      listModels()
        .then((list) => { if (!cancelled) setInstalled(new Set(list)); })
        .catch((e) =>
          console.error("HuggingFaceRepoDetail: listModels failed —", formatIpcError(e)),
        );
    refresh();
    (async () => {
      try {
        const u = await listen(EVENT_MODELS_CHANGED, () => refresh());
        if (cancelled) u();
        else unsub = u;
      } catch (e) {
        console.error(
          "HuggingFaceRepoDetail: listen(models-changed) failed —",
          formatIpcError(e),
        );
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const handleInstall = (v: HfVariantView) =>
    void install(repo, v.filename, variantName(v));

  return (
    <div data-testid="hf-repo-detail" className="flex flex-col gap-3 h-full">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs underline"
      >
        ← Back to search
      </button>
      <div className="text-sm font-medium break-all">{repo}</div>
      {loadStatus === "loading" && (
        <div data-testid="hf-detail-loading" className="text-xs text-gray-500">
          Loading variants…
        </div>
      )}
      {loadStatus === "error" && (
        <div role="alert" data-testid="hf-detail-error" className="text-xs text-red-600">
          {loadError}
          <button type="button" onClick={refetch} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}
      {loadStatus === "ready" && variants.length === 0 && (
        <div data-testid="hf-detail-empty" className="text-xs text-gray-500">
          No .gguf files in this repo.
        </div>
      )}
      {loadStatus === "ready" && variants.length > 0 && (
        <HfVariantTable
          variants={variants}
          installed={installed}
          busy={busy}
          nameOf={variantName}
          onInstall={handleInstall}
        />
      )}
      <HfInstallStatus state={state} onCancel={cancel} onReset={reset} />
    </div>
  );
}
