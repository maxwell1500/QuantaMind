import type { HfVariantView } from "../hooks/useHfRepoVariants";
import { classifyHfVariant } from "../classify_variant";
import { formatBytes } from "../../../shared/format/bytes";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { memoryFit, fitBadge } from "../fit";

type Props = {
  variants: HfVariantView[];
  installed: Set<string>;
  busy: boolean;
  snapshot: HardwareSnapshot | null;
  nameOf: (v: HfVariantView) => string;
  onInstall: (v: HfVariantView) => void;
};

export function HfVariantTable({
  variants,
  installed,
  busy,
  snapshot,
  nameOf,
  onInstall,
}: Props) {
  return (
    <table className="text-xs w-full border-collapse" data-testid="variant-table">
      <thead>
        <tr className="text-left text-gray-500">
          <th>Filename</th>
          <th>Quant</th>
          <th>Size</th>
          {snapshot && <th>Fit</th>}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {variants.map((v) => {
          const isInstalled = installed.has(nameOf(v));
          const klass = classifyHfVariant(v.filename);
          const blocked = klass.kind !== "model";
          const fit = snapshot ? fitBadge(memoryFit(v.sizeBytes, snapshot.available_memory_bytes)) : null;
          return (
            <tr
              key={v.filename}
              className="border-t"
              data-testid={`variant-${v.quantization}`}
            >
              <td className="py-1 pr-2 break-all">{v.filename}</td>
              <td className="py-1 pr-2">{v.quantization}</td>
              <td className="py-1 pr-2">{formatBytes(v.sizeBytes)}</td>
              {fit && (
                <td className={`py-1 pr-2 ${fit.cls}`} data-testid={`variant-fit-${v.quantization}`}>
                  {fit.text}
                </td>
              )}
              <td className="py-1">
                {isInstalled ? (
                  <span
                    className="text-xs text-green-600"
                    data-testid={`variant-installed-${v.quantization}`}
                  >
                    Installed ✓
                  </span>
                ) : blocked ? (
                  <span
                    className="text-xs text-amber-700"
                    title={klass.reason}
                    data-testid={`variant-blocked-${v.quantization}`}
                  >
                    {klass.label} · Not supported
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInstall(v)}
                    className="text-xs border rounded px-2 py-1 disabled:opacity-50"
                  >
                    {busy ? "…" : "Install"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
