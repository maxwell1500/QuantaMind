import { useCallback, useEffect, useState } from "react";
import { runCompare, stopCompare, type CompareStrategy } from "../../../shared/ipc/compare";
import { formatIpcError } from "../../../shared/ipc/error";
import { useCompareStore } from "../state/compareStore";
import { startCompareEventBus } from "../state/compareEventBus";

export function useCompareRun() {
  const isRunning = useCompareStore((s) => s.isRunning);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => { void startCompareEventBus(); }, []);

  const start = useCallback(async (strategy: CompareStrategy) => {
    const { selectedModels, prompt, initRun, finishRun } = useCompareStore.getState();
    if (selectedModels.length === 0) {
      setStartError("Pick at least one model.");
      return;
    }
    if (prompt.trim().length === 0) {
      setStartError("Type a prompt first.");
      return;
    }
    setStartError(null);
    initRun(selectedModels);
    try {
      await runCompare({ models: selectedModels.map((m) => m.name), prompt, strategy });
    } catch (e) {
      const msg = formatIpcError(e);
      setStartError(msg);
      finishRun();
    }
  }, []);

  const cancelAll = useCallback(async () => {
    try { await stopCompare(); } catch { /* best-effort */ }
  }, []);

  return { isRunning, startError, start, cancelAll };
}
