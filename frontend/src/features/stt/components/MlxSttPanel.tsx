import { useMlxSttEnv } from "../hooks/useMlxSttEnv";
import { useMlxSttCatalog } from "../hooks/useMlxSttCatalog";
import { useMlxSttInstall } from "../hooks/useMlxSttInstall";
import { useHardwareSnapshot } from "../../models/hooks/useHardwareSnapshot";
import { MlxSttCatalogTable } from "./MlxSttCatalogTable";

/// The mlx-audio engine panel: download `mlx-community/whisper-*` snapshots
/// (works even before mlx-audio is installed — it's a plain HF download). If the
/// engine isn't installed, a hint points at `pip install mlx-audio`; the server
/// itself is started from the STT header.
export function MlxSttPanel() {
  const { env, recheck } = useMlxSttEnv();
  const { catalog, installedRepos, refresh } = useMlxSttCatalog();
  const { install, cancel } = useMlxSttInstall(refresh);
  const { snapshot } = useHardwareSnapshot();

  return (
    <div className="flex flex-col gap-3" data-testid="mlx-stt-panel">
      {env && !env.found && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 flex flex-col gap-1">
          <div className="font-semibold">mlx-audio isn't installed</div>
          <p>
            Run <code className="bg-white/70 border rounded px-1">pip install mlx-audio</code>, then
            start it from the STT header. You can still download models below now.
          </p>
          <button
            type="button"
            onClick={() => void recheck()}
            data-testid="mlx-stt-recheck"
            className="self-start text-xs border rounded px-2 py-1 mt-1"
          >
            Re-check
          </button>
        </div>
      )}
      <MlxSttCatalogTable
        catalog={catalog}
        installedRepos={installedRepos}
        snapshot={snapshot}
        onInstall={(repo) => void install(repo)}
        onCancel={() => void cancel()}
      />
    </div>
  );
}
