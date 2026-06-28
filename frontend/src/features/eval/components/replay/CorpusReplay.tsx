import type { EnvView } from "../../../../shared/ipc/eval/batch";

type CorpusView = Extract<EnvView, { kind: "web_corpus" }>;

const OP_LABEL: Record<CorpusView["op"], string> = {
  none: "browsing",
  search: "search",
  fetch: "fetch",
};

/// The frozen web-search corpus as the agent sees it this turn: the corpus index on top (the doc
/// the agent fetched highlighted), and below it either the ranked search results (title + snippet)
/// or the fetched document's real full text. The "hooked" moment — the user watches the model
/// search, pick a result, and read the actual document. A pure render of one `CorpusView` snapshot
/// (the scrubber picks the turn). Lazy: only the index (id+title) ships per turn; full text rides
/// along only for the fetched doc.
export function CorpusReplay({ view }: { view: CorpusView }) {
  return (
    <div data-testid="corpus-replay">
      <div style={header}>
        <span style={{ fontWeight: 800 }}>Web Corpus</span>
        <span style={opBadge}>
          {OP_LABEL[view.op]}
          {view.query ? ` · "${view.query}"` : view.focus_doc ? ` · ${view.focus_doc}` : ""}
        </span>
      </div>

      <div style={treeBox}>
        {view.index.map((doc) => {
          const focused = doc.doc_id === view.focus_doc;
          return (
            <div
              key={doc.doc_id}
              data-testid={`corpus-doc-${doc.doc_id}`}
              data-focused={focused ? "true" : undefined}
              style={{ ...rowStyle, ...(focused ? focusedRow : null) }}
            >
              <span style={{ opacity: 0.7 }}>📄</span>
              <span style={focused ? { fontWeight: 700 } : undefined}>{doc.title}</span>
              <span style={{ opacity: 0.5, fontSize: 11 }}>{doc.doc_id}</span>
            </div>
          );
        })}
      </div>

      {view.op === "search" && (
        <div style={detailBox}>
          <div style={detailHeader}>results for "{view.query ?? ""}"</div>
          {view.results.length > 0 ? (
            <div style={resultsBody} data-testid="corpus-results">
              {view.results.map((hit, i) => (
                <div key={hit.doc_id} style={resultRow}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#1d4ed8" }}>{i + 1}. {hit.title}</span>
                    <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 6 }}>{hit.doc_id}</span>
                  </div>
                  <div style={snippetStyle}>{hit.snippet}</div>
                </div>
              ))}
            </div>
          ) : (
            <pre style={detailBody} data-testid="corpus-results">(no matches)</pre>
          )}
        </div>
      )}

      {view.op === "fetch" && view.content != null && (
        <div style={detailBox}>
          <div style={detailHeader}>content of {view.focus_doc}</div>
          <pre style={detailBody} data-testid="corpus-content">{view.content}</pre>
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
  background: "#f5f3ff",
  color: "#6d28d9",
  border: "1px solid #ddd6fe",
};
const treeBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#ffffff",
  padding: 6,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 4px",
  borderRadius: 4,
  color: "#334155",
};
const focusedRow: React.CSSProperties = { background: "#f5f3ff", color: "#6d28d9" };
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
const resultsBody: React.CSSProperties = { padding: 8, maxHeight: 180, overflow: "auto" };
const resultRow: React.CSSProperties = { marginBottom: 8, fontFamily: "Inter, sans-serif", fontSize: 12 };
const snippetStyle: React.CSSProperties = {
  marginTop: 2,
  color: "#475569",
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  whiteSpace: "pre-wrap",
};
