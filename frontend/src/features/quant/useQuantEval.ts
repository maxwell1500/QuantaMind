import { useCallback, useState } from "react";
import { listEvals, runEvalTask } from "../../shared/ipc/eval/evals";
import type { QuantVariant } from "./quantPick";

export interface QuantScore {
  passed: number;
  total: number;
  error?: boolean;
}

/// Run the bundled eval suite against each quant variant and tally a per-variant
/// pass-rate (quality). A variant whose backend errors is marked `error` rather
/// than reported as 0 (which would look like all-fail).
export function useQuantEval() {
  const [scores, setScores] = useState<Record<string, QuantScore>>({});
  const [running, setRunning] = useState(false);

  const run = useCallback(async (variants: QuantVariant[]) => {
    setRunning(true);
    setScores({});
    try {
      const tasks = await listEvals();
      for (const v of variants) {
        let passed = 0;
        try {
          for (const t of tasks) {
            const r = await runEvalTask(t.id, v.name, v.backend);
            if (r.passed) passed += 1;
          }
          setScores((s) => ({ ...s, [v.name]: { passed, total: tasks.length } }));
        } catch {
          setScores((s) => ({ ...s, [v.name]: { passed, total: tasks.length, error: true } }));
        }
      }
    } finally {
      setRunning(false);
    }
  }, []);

  return { scores, running, run };
}
