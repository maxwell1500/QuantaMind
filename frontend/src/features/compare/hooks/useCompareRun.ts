import { useCallback, useEffect, useState } from "react";
import { runCompare, stopCompare } from "../../../shared/ipc/compare/compare";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useCompareStore } from "../state/compareStore";
import { startCompareEventBus } from "../state/compareEventBus";
import { assessStrategies } from "../state/strategy";
import { formatBytes } from "../../../shared/format/bytes";
import { useParamsStore } from "../../../shared/state/paramsStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";

export function useCompareRun() {
  const isRunning = useCompareStore((s) => s.isRunning);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => { void startCompareEventBus(); }, []);

  const start = useCallback(async () => {
    const { prompt, systemPrompt, strategy, hardwareSnapshot, initRun, finishRun } = useCompareStore.getState();
    const selectedModels = useSelectedModelStore.getState().selectedModels;
    if (selectedModels.length === 0) { setStartError("Pick at least one model in the header."); return; }
    if (prompt.trim().length === 0) { setStartError("Type a prompt first."); return; }
    const matrix = assessStrategies(selectedModels, hardwareSnapshot);
    if (matrix && matrix[strategy].status === "wont_fit") {
      const need = formatBytes(matrix[strategy].required_bytes);
      const have = hardwareSnapshot ? formatBytes(hardwareSnapshot.available_memory_bytes) : "?";
      setStartError(`Strategy '${strategy}' needs ~${need} but only ${have} available.`);
      return;
    }
    setStartError(null);
    initRun(selectedModels);
    try {
      const system = systemPrompt.trim();
      // Each global model carries its own backend (coupled to its weight format).
      const backends = selectedModels.map((m) => m.backend);
      const { globalParams, keepLoaded, sharedParams, perModelParams } = useParamsStore.getState();
      await runCompare({
        models: selectedModels.map((m) => m.name),
        prompt,
        strategy,
        ...(system ? { system } : {}),
        params: globalParams,
        ...(sharedParams ? {} : { perModelParams }),
        backends,
        // Keep loaded → resident; off → omit so run_compare uses its strategy
        // default (Sequential unloads between models to stay memory-safe).
        ...(keepLoaded ? { keepAlive: -1 } : {}),
      });
    } catch (e) {
      setStartError(formatIpcError(e));
      finishRun();
    }
  }, []);

  const cancelAll = useCallback(async () => {
    try { await stopCompare(); } catch { /* best-effort */ }
  }, []);

  return { isRunning, startError, start, cancelAll };
}
