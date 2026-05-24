import { useEffect, useMemo } from "react";
import { useHfInstall } from "../hooks/useHfInstall";
import { useHfRepoVariants, type HfVariantView } from "../hooks/useHfRepoVariants";
import { useInstalledModelsStore } from "../state/installedModelsStore";
import { hfVariantModelName } from "../format";
import { HfVariantTable } from "./HfVariantTable";
import { HfInstallStatus } from "./HfInstallStatus";

type Props = { repo: string; onBack: () => void };

const variantName = (v: HfVariantView) =>
  hfVariantModelName(v.filename, v.quantization === "unknown" ? undefined : v.quantization);

export function HuggingFaceRepoDetail({ repo, onBack }: Props) {
  const { state, install, cancel, reset } = useHfInstall();
  const { variants, status: loadStatus, error: loadError, refetch } =
    useHfRepoVariants(repo);
  const busy = state.status === "downloading" || state.status === "installing";
  const list = useInstalledModelsStore((s) => s.list);
  const installStatus = useInstalledModelsStore((s) => s.status);
  const refreshInstalled = useInstalledModelsStore((s) => s.refresh);
  const installed = useMemo(() => new Set(list.map((m) => m.name)), [list]);

  useEffect(() => {
    if (installStatus === "idle") void refreshInstalled();
  }, [installStatus, refreshInstalled]);

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
