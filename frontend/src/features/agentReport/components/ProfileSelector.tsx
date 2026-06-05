import type { CSSProperties } from "react";
import type { ReadinessProfile } from "../../../shared/ipc/eval/readiness";

const chip: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 12,
  background: "#f1f5f9",
  border: "1px solid #e2e8f0",
  color: "#334155",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const yn = (b: boolean) => (b ? "YES" : "no");

/// The active profile's thresholds, shown so the verdict is always read "against
/// this profile" — never as objective truth. A nullable threshold renders "off".
function Thresholds({ p }: { p: ReadinessProfile }) {
  const items: string[] = [
    `Min Pass^k: ${pct(p.min_pass_k)}`,
    `Forbid loops: ${yn(p.forbid_infinite_loop)}`,
    `Forbid fake-done: ${yn(p.forbid_hallucinated_completion)}`,
    `Require full VRAM: ${yn(p.require_full_vram)}`,
    `Require native FC: ${yn(p.require_native_fc)}`,
    `Max steps: ${p.max_avg_steps ?? "off"}`,
    `Max latency: ${p.max_ms_per_step != null ? `${p.max_ms_per_step} ms/step` : "off"}`,
    `Min context: ${p.min_context_tokens != null ? `${p.min_context_tokens} tok` : "off"}`,
  ];
  return (
    <div data-testid="readiness-thresholds" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {items.map((t) => (
        <span key={t} style={chip}>{t}</span>
      ))}
    </div>
  );
}

export function ProfileSelector({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: ReadinessProfile[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const active = profiles.find((p) => p.id === selectedId);
  return (
    <div>
      <label style={{ fontSize: 13, color: "#334155" }}>
        Target profile:{" "}
        <select
          data-testid="readiness-profile-select"
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      {active && <Thresholds p={active} />}
    </div>
  );
}
