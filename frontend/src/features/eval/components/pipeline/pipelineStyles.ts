import type { CSSProperties } from "react";

/// Shared panel chrome for the pipeline phase cards (light theme — these render on
/// the white Evaluator surface, so the surface is light and the text dark).
export const panelBox: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 16,
};

export const panelLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "#64748b",
  fontFamily: "Inter,sans-serif",
  marginBottom: 8,
  letterSpacing: "0.02em",
};

export const codeBlock: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.6,
  color: "#334155",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
