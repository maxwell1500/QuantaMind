import { useCallback, useState } from "react";
import { runToolcallEval } from "../../shared/ipc/eval/toolcall";
import type { QuantVariant } from "./quantPick";

/// Run the tool-call reliability eval per quant variant; record the composite
/// score (null = backend error — shown as "n/a", never a fabricated 0). This is
/// the headline differentiator: the tool-call quality spread across quants.
export function useQuantToolcall() {
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [running, setRunning] = useState(false);

  const run = useCallback(async (variants: QuantVariant[]) => {
    setRunning(true);
    setScores({});
    try {
      for (const v of variants) {
        try {
          const r = await runToolcallEval(v.name, v.backend);
          setScores((s) => ({ ...s, [v.name]: r.composite }));
        } catch {
          setScores((s) => ({ ...s, [v.name]: null }));
        }
      }
    } finally {
      setRunning(false);
    }
  }, []);

  return { scores, running, run };
}
