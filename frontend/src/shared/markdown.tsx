import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-shell";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

/// Render a tiny markdown subset — bold, inline code, links — inline.
export function parseInline(text: string): ReactNode[] {
  return text.split(INLINE).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) {
      return <code key={i} className="px-1 bg-gray-100 rounded text-[11px]">{p.slice(1, -1)}</code>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          onClick={(e) => { e.preventDefault(); void open(link[2]); }}
          className="text-blue-700 hover:underline"
        >
          {link[1]}
        </a>
      );
    }
    return p;
  });
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const HEADING_CLASS: Record<number, string> = {
  1: "text-sm font-semibold mt-2",
  2: "text-xs font-semibold mt-2",
  3: "text-xs font-medium mt-1",
};

/// Render headings (#/##/###), list-ish lines, and inline marks. Covers
/// what release notes use; not a full CommonMark implementation.
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-xs text-gray-700 space-y-1" data-testid="markdown">
      {lines.map((line, i) => {
        const h = HEADING.exec(line);
        if (h) {
          const level = h[1].length;
          return <div key={i} className={HEADING_CLASS[level]}>{parseInline(h[2])}</div>;
        }
        if (line.trim() === "") return null;
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        if (bullet) return <div key={i} className="pl-3">• {parseInline(bullet[1])}</div>;
        return <p key={i}>{parseInline(line)}</p>;
      })}
    </div>
  );
}
