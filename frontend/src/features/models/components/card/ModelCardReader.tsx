// Real HF READMEs contain raw HTML tables/blockquotes, HTML comments, and
// markdown links. This is a flat, line-by-line transformer that renders every
// line as React string children (auto-escaped) — it NEVER injects HTML (no
// dangerouslySetInnerHTML). Raw-HTML lines go into an inert <pre>; HTML comments
// are dropped; markdown links/images collapse to their label so a heavy README
// degrades gracefully and stays readable.
const HTML_LINE = /^\s*<\/?[a-zA-Z]/;

/// Collapse inline markdown to plain text: `![alt](url)` → alt, `[text](url)` →
/// text. The result is still rendered as escaped text (no injection).
function inline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

export function ModelCardReader({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  let inCode = false;
  let inComment = false;
  return (
    <div className="space-y-1 text-sm" data-testid="model-card">
      {lines.map((line, i) => {
        // Drop HTML comments (single- or multi-line) — pure noise.
        if (inComment) {
          if (line.includes("-->")) inComment = false;
          return null;
        }
        if (line.includes("<!--")) {
          if (!line.includes("-->")) inComment = true;
          return null;
        }
        if (line.startsWith("```")) {
          inCode = !inCode;
          return null;
        }
        if (inCode || HTML_LINE.test(line)) {
          return (
            <pre key={i} className="font-mono text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 overflow-x-auto">
              {line}
            </pre>
          );
        }
        if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold mt-2">{inline(line.slice(4))}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-base font-semibold mt-3">{inline(line.slice(3))}</h2>;
        if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold mt-3">{inline(line.slice(2))}</h1>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="list-disc ml-5">{inline(line.slice(2))}</li>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="leading-relaxed">{inline(line)}</p>;
      })}
    </div>
  );
}
