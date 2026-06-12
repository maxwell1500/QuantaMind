import { formatBytes } from "../../../shared/format/bytes";
import { memoryFit, fitBadge } from "../../models/fit";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { MlxSttCatalogEntry } from "../../../shared/ipc/stt/mlxStt";
import { useModelStore } from "../../models/state/modelStore";
import { SttError } from "./SttError";

type Props = {
  catalog: MlxSttCatalogEntry[];
  installedRepos: Set<string>;
  snapshot: HardwareSnapshot | null;
  onInstall: (repo: string) => void;
  onCancel: () => void;
};

/// The curated MLX whisper catalog (mlx-community/whisper-*) with size +
/// memory-fit disclosure, mirroring the whisper.cpp catalog table but keyed on
/// the repo id. The active download's progress/guidance renders below (and in
/// the Downloads page — same shared store).
export function MlxSttCatalogTable({ catalog, installedRepos, snapshot, onInstall, onCancel }: Props) {
  const install = useModelStore((s) => (s.activeSttName ? s.downloads[s.activeSttName] ?? null : null));
  const busy = install?.status === "downloading";

  return (
    <div className="flex flex-col gap-2">
      <table className="text-xs w-full border-collapse" data-testid="mlx-stt-catalog">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Model</th>
            <th>Language</th>
            <th>Size</th>
            {snapshot && <th>Fit</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {catalog.map((m) => {
            const isInstalled = installedRepos.has(m.repo);
            const fit = snapshot ? fitBadge(memoryFit(m.disk_bytes, snapshot.available_memory_bytes)) : null;
            return (
              <tr key={m.repo} className="border-t" data-testid={`mlx-stt-row-${m.repo}`}>
                <td className="py-1 pr-2">{m.display}</td>
                <td className="py-1 pr-2 text-gray-500">{m.multilingual ? "Multilingual" : "English"}</td>
                <td className="py-1 pr-2">{formatBytes(m.disk_bytes)}</td>
                {fit && <td className={`py-1 pr-2 ${fit.cls}`}>{fit.text}</td>}
                <td className="py-1">
                  {isInstalled ? (
                    <span className="text-xs text-green-600" data-testid={`mlx-stt-installed-${m.repo}`}>
                      Installed ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onInstall(m.repo)}
                      className="text-xs border rounded px-2 py-1 disabled:opacity-50"
                    >
                      {busy && install?.id === m.repo ? "…" : "Download"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {install?.status === "downloading" && (
        <div data-testid="mlx-stt-downloading" className="flex items-center gap-2">
          <progress value={install.percent} max={100} className="flex-1 h-2" />
          <span className="text-xs tabular-nums w-10 text-right">{install.percent}%</span>
          <button type="button" onClick={onCancel} className="text-xs border rounded px-2 py-1">
            Cancel
          </button>
        </div>
      )}
      {install?.status === "success" && (
        <div role="status" data-testid="mlx-stt-install-done" className="text-green-700 text-xs">
          Downloaded ✓ — pick mlx-audio + this model in the header and press ▶.
        </div>
      )}
      {install?.status === "error" && install.error && (
        <SttError message={install.error} testid="mlx-stt-install-error" />
      )}
    </div>
  );
}
