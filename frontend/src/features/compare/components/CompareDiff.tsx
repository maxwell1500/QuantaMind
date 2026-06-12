import { useState } from "react";
import { useCompareStore } from "../state/compareStore";
import { DiffView } from "./DiffView";
import { useModelLabel } from "../../models/hooks/useModelLabel";

/// Shows a word-level diff between the two finished model outputs. Only offered
/// when exactly two rows are done (diff is pairwise).
export function CompareDiff() {
  const rows = useCompareStore((s) => s.rows);
  const label = useModelLabel();
  const [show, setShow] = useState(false);

  const done = rows.filter((r) => r.status === "done");
  if (done.length !== 2) return null;
  const [a, b] = done;

  return (
    <div className="space-y-1" data-testid="compare-diff">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
        data-testid="diff-toggle"
      >
        {show ? "Hide diff" : `Diff: ${label(a.model)} → ${label(b.model)}`}
      </button>
      {show && <DiffView a={a.output} b={b.output} />}
    </div>
  );
}
