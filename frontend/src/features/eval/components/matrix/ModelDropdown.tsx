import { useRef, useState } from "react";
import type { InstalledModelInfo } from "../../../../shared/ipc/models/storage";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { usePopoverDismiss } from "../../../../shared/ui/usePopoverDismiss";

/// Multi-select dropdown of installed models to include as matrix columns.
/// Selecting an option toggles it and keeps the menu open (multi-select).
export function ModelDropdown({
  models,
  selected,
  onToggle,
}: {
  models: InstalledModelInfo[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, ref, () => setOpen(false));

  const count = selected.size;
  const label = count === 0 ? "Select models…" : `${count} model${count > 1 ? "s" : ""}`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={models.length === 0}
        onClick={() => setOpen((o) => !o)}
        data-testid="eval-model-dropdown"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 7, color: "#94a3b8", fontSize: 12, fontFamily: "Inter,sans-serif",
          padding: "5px 10px", outline: "none", cursor: models.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {models.length === 0 ? "No installed models" : label}
        <span style={{ color: "#64748b" }}>▾</span>
      </button>

      {open && models.length > 0 && (
        <div
          role="listbox"
          aria-multiselectable
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20,
            minWidth: 220, maxHeight: 260, overflowY: "auto",
            background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.45)", padding: 4,
          }}
        >
          {models.map((m) => {
            const on = selected.has(m.name);
            return (
              <button
                key={m.name}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(m.name)}
                data-testid={`eval-model-toggle-${m.name}`}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  background: on ? "rgba(59,130,246,0.16)" : "transparent",
                  border: "none", borderRadius: 6, padding: "7px 9px",
                  color: on ? "#93c5fd" : "#cbd5e1", fontSize: 12, fontFamily: "Inter,sans-serif", cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 15, height: 15, flexShrink: 0, borderRadius: 4,
                    border: `1px solid ${on ? "#60a5fa" : "rgba(255,255,255,0.2)"}`,
                    background: on ? "#2563eb" : "transparent",
                    color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                {modelLabel(m)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
