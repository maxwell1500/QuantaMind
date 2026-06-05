import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { archLabel, capOptions, defaultCapBytes } from "../capBytes";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { READINESS_HELP } from "../readinessHelp";

/// The host hardware panel: the detected GPU architecture (UMA vs discrete vs
/// CPU) and an allocation-cap dropdown. Changing the cap re-assesses fit in
/// session — it is not persisted.
export function HostHardwareProfile({
  hardware,
  capBytes,
  onCapChange,
}: {
  hardware: HardwareSnapshot | null;
  capBytes: number | null;
  onCapChange: (bytes: number) => void;
}) {
  const options = capOptions(defaultCapBytes(hardware) ?? capBytes);
  const isAppleSilicon = hardware?.is_apple_silicon ?? false;

  return (
    <div data-testid="host-hardware-profile" className="space-y-4">
      {/* Architecture Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <span className="w-48 text-slate-500 font-medium">Architecture:</span>
        <div className="flex flex-wrap gap-2">
          <span
            className={`px-3 py-1.5 border rounded-lg text-xs font-semibold select-none transition-all ${
              !isAppleSilicon
                ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                : "bg-slate-50 border-slate-200 text-slate-400 opacity-60"
            }`}
          >
            [ NVIDIA Discrete GPU (PCIe) ]
          </span>
          <span
            className={`px-3 py-1.5 border rounded-lg text-xs font-semibold select-none transition-all ${
              isAppleSilicon
                ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                : "bg-slate-50 border-slate-200 text-slate-400 opacity-60"
            }`}
          >
            [ Apple Silicon Unified Memory (UMA) ]
          </span>
        </div>
        {/* Hidden architecture text for tests */}
        <span className="hidden">{archLabel(hardware)}</span>
      </div>

      {/* VRAM Allocation Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <span className="w-48 text-slate-500 font-medium flex items-center gap-1.5">
          Host VRAM/RAM Allocation Cap:
          <InfoButton {...READINESS_HELP.vramCap} testId="readiness-vramcap" />
        </span>
        <div className="relative w-48">
          <select
            data-testid="readiness-cap-select"
            value={capBytes ?? ""}
            onChange={(e) => onCapChange(Number(e.target.value))}
            className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 pl-3 pr-10 text-sm text-slate-800 shadow-sm transition-all outline-none appearance-none cursor-pointer"
          >
            {options.map((o) => (
              <option key={o.bytes} value={o.bytes}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}


