import { useEffect, useState } from "react";
import { getDiskUsage, type DiskUsage } from "../../../../shared/ipc/models/storage";
import { formatBytes } from "../../../../shared/format/bytes";
import { StoragePathSection } from "../StoragePathSection";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useInstalledModelsStore } from "../../state/installedModelsStore";

export function StorageTab() {
  const list = useInstalledModelsStore((s) => s.list);
  const [usage, setUsage] = useState<DiskUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiskUsage().then(setUsage).catch((e) => setError(formatIpcError(e)));
  }, [list]);

  return (
    <div data-testid="storage-tab" className="flex flex-col gap-3 h-full">
      <StoragePathSection />
      {usage && (
        <div className="text-xs text-gray-600" data-testid="disk-summary">
          Models: {formatBytes(usage.ollama_models_bytes)} / Free:{" "}
          {formatBytes(usage.free_bytes)} on disk
        </div>
      )}
      {error && <div role="alert" className="text-red-600 text-xs">{error}</div>}
      <p className="text-xs text-gray-500">
        Manage installed models from the Downloads page.
      </p>
    </div>
  );
}
