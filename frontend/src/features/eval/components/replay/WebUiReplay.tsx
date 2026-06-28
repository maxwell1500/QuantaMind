import type { EnvView } from "../../../../shared/ipc/eval/batch";

type WebUiView = Extract<EnvView, { kind: "web_ui" }>;

const FOCUS = "#2563eb";
const FOCUS_BG = "#eff6ff";

/// The web UI as the agent left it AFTER this turn's action: a schematic "browser window" with the
/// route in the address bar, each form field as an input box (current value), each toggle as a
/// switch, and a submit badge. The control the agent touched this turn is highlighted. A pure
/// render of one `WebUiView` snapshot (the scrubber picks the turn); the state MUTATES across turns,
/// so scrubbing the timeline literally replays the UI changing.
export function WebUiReplay({ view }: { view: WebUiView }) {
  const state = (view.state ?? {}) as Record<string, unknown>;
  const route = typeof state.route === "string" ? state.route : "/";
  const fields = isRecord(state.fields) ? state.fields : {};
  const toggles = isRecord(state.toggles) ? state.toggles : {};
  const submitted = state.submitted === true;
  const focus = view.focus ?? null;

  const rows: { y: number; el: React.ReactNode }[] = [];
  let y = 44;
  const ROW = 34;

  for (const [name, value] of Object.entries(fields)) {
    rows.push({ y, el: fieldRow(name, value, name === focus, y) });
    y += ROW;
  }
  for (const [name, on] of Object.entries(toggles)) {
    rows.push({ y, el: toggleRow(name, on === true, name === focus, y) });
    y += ROW;
  }
  const height = y + 44;

  return (
    <div data-testid="webui-replay">
      <div style={header}>
        <span style={{ fontWeight: 800 }}>Web UI</span>
        <span style={opBadge}>
          {view.action ?? "viewing"}
          {focus ? ` · ${focus}` : ""}
        </span>
      </div>

      <svg viewBox={`0 0 320 ${height}`} width="100%" style={frame} data-testid="webui-schematic" role="img">
        {/* window chrome + address bar */}
        <rect x="1" y="1" width="318" height={height - 2} rx="8" fill="#ffffff" stroke="#e2e8f0" />
        <rect x="1" y="1" width="318" height="30" rx="8" fill="#f8fafc" />
        <circle cx="14" cy="16" r="4" fill="#e2e8f0" />
        <circle cx="28" cy="16" r="4" fill="#e2e8f0" />
        <rect x="44" y="8" width="264" height="16" rx="8" fill="#ffffff" stroke="#e2e8f0" />
        <text x="52" y="20" fontSize="11" fill="#475569" fontFamily="ui-monospace, Menlo, monospace" data-testid="webui-route">
          {route}
        </text>

        {rows.map((r, i) => (
          <g key={i}>{r.el}</g>
        ))}

        {/* submit badge */}
        <rect
          x="12"
          y={height - 32}
          width="120"
          height="22"
          rx="4"
          fill={submitted ? "#dcfce7" : "#f1f5f9"}
          stroke={submitted ? "#16a34a" : "#cbd5e1"}
          data-testid="webui-submit"
          data-submitted={submitted ? "true" : "false"}
        />
        <text x="24" y={height - 17} fontSize="11" fontWeight="700" fill={submitted ? "#15803d" : "#94a3b8"} fontFamily="Inter, sans-serif">
          {submitted ? "✓ submitted" : "not submitted"}
        </text>
      </svg>
    </div>
  );
}

function fieldRow(name: string, value: unknown, focused: boolean, y: number): React.ReactNode {
  const text = value == null || value === "" ? "—" : String(value);
  return (
    <g data-testid={`webui-field-${name}`} data-focused={focused ? "true" : undefined}>
      <text x="14" y={y + 18} fontSize="11" fill="#64748b" fontFamily="Inter, sans-serif">
        {name}
      </text>
      <rect x="120" y={y + 4} width="188" height="22" rx="4" fill={focused ? FOCUS_BG : "#ffffff"} stroke={focused ? FOCUS : "#e2e8f0"} />
      <text x="128" y={y + 19} fontSize="12" fontWeight={focused ? 700 : 500} fill="#0f172a" fontFamily="ui-monospace, Menlo, monospace">
        {text}
      </text>
    </g>
  );
}

function toggleRow(name: string, on: boolean, focused: boolean, y: number): React.ReactNode {
  return (
    <g data-testid={`webui-toggle-${name}`} data-focused={focused ? "true" : undefined} data-on={on ? "true" : "false"}>
      <text x="14" y={y + 18} fontSize="11" fill="#64748b" fontFamily="Inter, sans-serif">
        {name}
      </text>
      <rect x="272" y={y + 5} width="36" height="18" rx="9" fill={on ? "#2563eb" : "#cbd5e1"} stroke={focused ? FOCUS : "transparent"} strokeWidth={focused ? 2 : 0} />
      <circle cx={on ? 299 : 281} cy={y + 14} r="7" fill="#ffffff" />
    </g>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: "#0f172a",
  fontFamily: "Inter, sans-serif",
  marginBottom: 6,
};
const opBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 4,
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #dbeafe",
};
const frame: React.CSSProperties = { display: "block", maxHeight: 320 };
