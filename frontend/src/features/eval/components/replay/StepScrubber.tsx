/// A controlled timeline scrubber over a run's turns. Drives the visual environment replay:
/// dragging (or ◀/▶) selects which turn's environment snapshot the panel shows. Pure +
/// controlled — the parent owns the selected index (so it can follow the live tail).
export function StepScrubber({
  count,
  value,
  onChange,
}: {
  count: number;
  value: number;
  onChange: (i: number) => void;
}) {
  if (count <= 1) return null;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  return (
    <div style={row} data-testid="step-scrubber">
      <button type="button" style={btn} onClick={() => onChange(clamp(value - 1))} disabled={value <= 0} aria-label="previous turn">
        ◀
      </button>
      <input
        type="range"
        min={0}
        max={count - 1}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        style={{ flex: 1 }}
        aria-label="turn scrubber"
      />
      <button type="button" style={btn} onClick={() => onChange(clamp(value + 1))} disabled={value >= count - 1} aria-label="next turn">
        ▶
      </button>
      <span style={label} data-testid="step-scrubber-label">
        turn {value + 1}/{count}
      </span>
    </div>
  );
}

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginTop: 8 };
const btn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  background: "#f1f5f9",
  border: "1px solid #e2e8f0",
  borderRadius: 4,
  padding: "1px 7px",
  cursor: "pointer",
};
const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#64748b", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap" };
