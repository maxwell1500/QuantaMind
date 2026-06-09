import { formatBytes } from "../../../shared/format/bytes";
import { memoryFit, fitBadge } from "../../models/fit";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { SttCatalogEntry } from "../../../shared/ipc/stt/stt";
import { useSttInstallStore } from "../state/sttInstallStore";
import { SttError } from "./SttError";

type Props = {
  catalog: SttCatalogEntry[];
  installedIds: Set<string>;
  snapshot: HardwareSnapshot | null;
  onInstall: (id: string) => void;
  onCancel: () => void;
};

/// The curated whisper catalog with size + memory-fit disclosure before
/// download, mirroring the HF model browser's columns. VRAM isn't measured, so
/// there's no fabricated VRAM column — the Fit badge (real available memory) is
/// the headroom signal. The active download's progress/guidance render below.
export function SttCatalogTable({ catalog, installedIds, snapshot, onInstall, onCancel }: Props) {
  const install = useSttInstallStore();
  const busy = install.status === "downloading";

  return (
    <div className="flex flex-col gap-2">
      <table className="text-xs w-full border-collapse" data-testid="stt-catalog">
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
            const isInstalled = installedIds.has(m.id);
            const fit = snapshot
              ? fitBadge(memoryFit(m.disk_bytes, snapshot.available_memory_bytes))
              : null;
            return (
              <tr key={m.id} className="border-t" data-testid={`stt-row-${m.id}`}>
                <td className="py-1 pr-2">{m.display}</td>
                <td className="py-1 pr-2 text-gray-500">{m.multilingual ? "Multilingual" : "English"}</td>
                <td className="py-1 pr-2">{formatBytes(m.disk_bytes)}</td>
                {fit && <td className={`py-1 pr-2 ${fit.cls}`}>{fit.text}</td>}
                <td className="py-1">
                  {isInstalled ? (
                    <span className="text-xs text-green-600" data-testid={`stt-installed-${m.id}`}>
                      Installed ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onInstall(m.id)}
                      className="text-xs border rounded px-2 py-1 disabled:opacity-50"
                    >
                      {busy && install.modelId === m.id ? "…" : "Download"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {install.status === "downloading" && (
        <div data-testid="stt-downloading" className="flex items-center gap-2">
          <progress value={install.percent} max={100} className="flex-1 h-2" />
          <span className="text-xs tabular-nums w-10 text-right">{install.percent}%</span>
          <button type="button" onClick={onCancel} className="text-xs border rounded px-2 py-1">
            Cancel
          </button>
        </div>
      )}
      {install.status === "done" && (
        <div role="status" data-testid="stt-install-done" className="text-green-700 text-xs">
          Downloaded ✓ — start the server below to use it.
        </div>
      )}
      {install.status === "error" && install.error && (
        <SttError message={install.error} testid="stt-install-error" />
      )}
    </div>
  );
}
