import type { EnvView } from "../../../../shared/ipc/eval/batch";

type FsView = Extract<EnvView, { kind: "file_system" }>;

const OP_LABEL: Record<FsView["op"], string> = {
  none: "browsing",
  read: "read_file",
  list: "list_dir",
  search: "search",
};

/// The simulated filesystem as the agent sees it this turn: the file tree (with the touched
/// path highlighted) on the left, and the real returned content / matches on the right. This
/// is the "hooked" moment — the user watches the model open a file and read its actual content,
/// not an empty ack. A pure render of one `FsView` snapshot (the scrubber picks the turn).
export function FileTreeReplay({ view }: { view: FsView }) {
  return (
    <div data-testid="fs-replay">
      <div style={header}>
        <span style={{ fontWeight: 800 }}>Filesystem</span>
        <span style={opBadge}>{OP_LABEL[view.op]}{view.focus_path ? ` · ${view.focus_path}` : ""}</span>
      </div>

      <div style={treeBox}>
        {view.tree.map((node) => {
          const depth = node.path.split("/").length - 1;
          const name = node.path.split("/").pop() ?? node.path;
          const focused = node.path === view.focus_path;
          return (
            <div
              key={node.path}
              data-testid={`fs-node-${node.path}`}
              data-focused={focused ? "true" : undefined}
              style={{ ...rowStyle(depth), ...(focused ? focusedRow : null) }}
            >
              <span style={{ opacity: 0.7 }}>{node.is_dir ? "📁" : "📄"}</span>
              <span style={focused ? { fontWeight: 700 } : undefined}>{name}</span>
            </div>
          );
        })}
      </div>

      {view.op === "read" && view.content != null && (
        <div style={detailBox}>
          <div style={detailHeader}>content of {view.focus_path}</div>
          <pre style={detailBody} data-testid="fs-content">{view.content}</pre>
        </div>
      )}

      {(view.op === "list" || view.op === "search") && view.matches.length > 0 && (
        <div style={detailBox}>
          <div style={detailHeader}>{view.op === "list" ? "entries" : "matches"}</div>
          <pre style={detailBody} data-testid="fs-matches">{view.matches.join("\n")}</pre>
        </div>
      )}
    </div>
  );
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
const treeBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#ffffff",
  padding: 6,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};
const rowStyle = (depth: number): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 4px",
  paddingLeft: 4 + depth * 16,
  borderRadius: 4,
  color: "#334155",
});
const focusedRow: React.CSSProperties = { background: "#eff6ff", color: "#1d4ed8" };
const detailBox: React.CSSProperties = { marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" };
const detailHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#64748b",
  background: "#f8fafc",
  padding: "4px 8px",
  borderBottom: "1px solid #e2e8f0",
  fontFamily: "Inter, sans-serif",
};
const detailBody: React.CSSProperties = {
  margin: 0,
  padding: 8,
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  whiteSpace: "pre-wrap",
  color: "#0f172a",
  maxHeight: 180,
  overflow: "auto",
};
