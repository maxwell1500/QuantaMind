import type { CSSProperties } from "react";
import type { ToolTaskResult } from "../../shared/ipc/eval/toolcall";
import type { ToolTask } from "../../shared/ipc/eval/registry";

/// Percentage label for a 0..1 score, "n/a" when unknown.
export function scoreLabel(value: number | null): string {
  return value == null ? "n/a" : `${Math.round(value * 100)}%`;
}

/// Did a task pass? Abstain tasks pass iff they correctly abstained; every other
/// category needs parse + tool + args all correct.
export function isPassed(result: ToolTaskResult): boolean {
  const v = result.verdict;
  if (result.category === "abstain") return v.abstain_correct === true;
  return v.parsed && v.tool_match && v.args_match;
}

/// One-line pass/fail diagnosis for a single task result.
export function traceDiag(_task: ToolTask | null, result: ToolTaskResult): { ok: boolean; msg: string } {
  const v = result.verdict;
  if (result.category === "abstain") {
    const ok = v.abstain_correct === true;
    return {
      ok,
      msg: ok
        ? "✓ Correctly abstained — no tool call made."
        : "✗ Error: Called a tool when abstention was expected.",
    };
  }
  if (!v.parsed) return { ok: false, msg: "✗ Error: Output plain text instead of JSON schema." };
  if (!v.tool_match)
    return { ok: false, msg: "✗ Error: Wrong tool selected — expected name mismatch." };
  if (!v.args_match)
    return { ok: false, msg: "✗ Error: Missing or incorrect arguments in tool call." };
  return { ok: true, msg: "✓ AST Matched: Call successful." };
}

/// The four sub-scores for a single task verdict (1/0, or null when the metric
/// doesn't apply to the category) — feeds the same StatsBar the aggregate uses.
export function verdictToScores(result: ToolTaskResult): {
  parse_rate: number | null;
  tool_selection_acc: number | null;
  arg_acc: number | null;
  abstain_acc: number | null;
} {
  const v = result.verdict;
  if (result.category === "abstain") {
    return { parse_rate: null, tool_selection_acc: null, arg_acc: null, abstain_acc: v.abstain_correct ? 1 : 0 };
  }
  return {
    parse_rate: v.parsed ? 1 : 0,
    tool_selection_acc: v.tool_match ? 1 : 0,
    arg_acc: v.args_match ? 1 : 0,
    abstain_acc: null,
  };
}

// ── Pass/fail badges (shared by the results table and the task list/detail) ─────

const badgeBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "Inter,sans-serif",
};

export const passedBadge: CSSProperties = {
  ...badgeBase,
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.22)",
  color: "#4ade80",
};

export const failedBadge: CSSProperties = {
  ...badgeBase,
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.2)",
  color: "#f87171",
};

export const pendingBadge: CSSProperties = {
  ...badgeBase,
  background: "rgba(148,163,184,0.07)",
  border: "1px solid rgba(148,163,184,0.15)",
  color: "#64748b",
};
