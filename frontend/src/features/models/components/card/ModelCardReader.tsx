// Real HF READMEs contain raw HTML tables/blockquotes. This is a flat,
// line-by-line transformer that renders every line as React string children
// (auto-escaped) — it NEVER injects HTML (no dangerouslySetInnerHTML). Lines
// that look like raw HTML are dumped into an inert <pre> so a heavy README
// degrades gracefully instead of breaking the DOM.
const HTML_LINE = /^\s*<\/?[a-zA-Z]/;

export function ModelCardReader({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  let inCode = false;
  return (
    <div className="space-y-1 text-sm" data-testid="model-card">
      {lines.map((line, i) => {
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
        if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold mt-2">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-base font-semibold mt-3">{line.slice(3)}</h2>;
        if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold mt-3">{line.slice(2)}</h1>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="list-disc ml-5">{line.slice(2)}</li>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="leading-relaxed">{line}</p>;
      })}
    </div>
  );
}
