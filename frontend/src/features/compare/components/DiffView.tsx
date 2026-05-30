import { diffSegments } from "../format/diff";

const CLASS: Record<string, string> = {
  ins: "bg-green-100 text-green-800",
  del: "bg-red-100 text-red-800 line-through",
  eq: "",
};

/// Highlights the word-level difference between two model outputs: green =
/// added in `b`, red strike-through = removed from `a`.
export function DiffView({ a, b }: { a: string; b: string }) {
  const segs = diffSegments(a, b);
  return (
    <pre
      data-testid="diff-view"
      className="text-xs whitespace-pre-wrap break-words border rounded p-2 bg-surface max-h-72 overflow-y-auto"
    >
      {segs.map((s, i) => (
        <span key={i} className={CLASS[s.kind]}>{s.text}</span>
      ))}
    </pre>
  );
}
