import { useEffect, useState } from "react";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useHardwareSnapshot } from "../../models/hooks/useHardwareSnapshot";
import { formatBytes } from "../../../shared/format/bytes";
import { memoryFit, fitBadge } from "../../models/fit";
import { groupQuantVariants } from "../quantPick";
import { recommendQuant, USE_CASES, type UseCase } from "../recommend";

/// The Quant tab: pick a model that has several installed quantizations, and get
/// a use-case-aware recommendation (plus a per-quant size + fit table).
export function QuantPage() {
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const { snapshot } = useHardwareSnapshot();
  const [usecase, setUsecase] = useState<UseCase>("quality-writing");
  const [groupKey, setGroupKey] = useState("");

  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const groups = groupQuantVariants(list);
  const group = groups.find((g) => g.key === groupKey) ?? groups[0] ?? null;
  const rec = group ? recommendQuant(usecase, snapshot, group.variants) : null;

  return (
    <div className="space-y-3" data-testid="quant-page">
      <div className="flex gap-2 items-center">
        <select
          value={group?.key ?? ""}
          onChange={(e) => setGroupKey(e.target.value)}
          data-testid="quant-model-select"
          className="border rounded px-2 py-1 text-sm"
        >
          {groups.length === 0 && <option value="">No models with multiple quants installed</option>}
          {groups.map((g) => (
            <option key={g.key} value={g.key}>{g.key} ({g.variants.length})</option>
          ))}
        </select>
        <select
          value={usecase}
          onChange={(e) => setUsecase(e.target.value as UseCase)}
          data-testid="quant-usecase-select"
          className="border rounded px-2 py-1 text-sm"
        >
          {USE_CASES.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>

      {rec?.pick && (
        <div data-testid="quant-recommendation" className="border rounded p-2 bg-blue-50 text-sm">
          <span className="font-medium">Recommended: {rec.pick.quantization}</span> — {rec.why}
        </div>
      )}
      {rec && !rec.pick && (
        <p data-testid="quant-no-rec" className="text-sm text-gray-600">{rec.why}</p>
      )}

      {group && (
        <table className="text-xs w-full border-collapse" data-testid="quant-table">
          <thead>
            <tr className="text-left text-gray-500"><th>Quant</th><th>Size</th>{snapshot && <th>Fit</th>}</tr>
          </thead>
          <tbody>
            {group.variants.map((v) => {
              const fit = snapshot ? fitBadge(memoryFit(v.sizeBytes, snapshot.available_memory_bytes)) : null;
              return (
                <tr key={v.name} className="border-t" data-testid={`quant-variant-${v.quantization}`}>
                  <td className="py-1 pr-2">{v.quantization}</td>
                  <td className="py-1 pr-2">{formatBytes(v.sizeBytes)}</td>
                  {fit && <td className={`py-1 pr-2 ${fit.cls}`}>{fit.text}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
