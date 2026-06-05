import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { archLabel, capOptions, defaultCapBytes } from "../capBytes";

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
  return (
    <section
      data-testid="host-hardware-profile"
      style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#334155" }}
    >
      <div>
        Architecture: <span style={{ fontWeight: 600 }}>{archLabel(hardware)}</span>
      </div>
      <label>
        VRAM/RAM allocation cap:{" "}
        <select
          data-testid="readiness-cap-select"
          value={capBytes ?? ""}
          onChange={(e) => onCapChange(Number(e.target.value))}
          style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
        >
          {options.map((o) => (
            <option key={o.bytes} value={o.bytes}>{o.label}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
