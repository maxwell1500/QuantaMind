import { diff_match_patch } from "diff-match-patch";

export type DiffKind = "eq" | "ins" | "del";
export interface DiffSeg {
  text: string;
  kind: DiffKind; // ins = added in `b`, del = removed from `a`
}

/// Word-level diff of two model outputs, with semantic cleanup for readable
/// chunks. Pure (no DOM) so it's unit-tested directly.
export function diffSegments(a: string, b: string): DiffSeg[] {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, text]) => ({
    text,
    kind: op === 0 ? "eq" : op === 1 ? "ins" : "del",
  }));
}
