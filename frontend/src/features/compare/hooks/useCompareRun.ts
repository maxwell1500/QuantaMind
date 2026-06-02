import { useCallback, useEffect, useState } from "react";
import { runCompare, stopCompare } from "../../../shared/ipc/compare/compare";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useCompareStore } from "../state/compareStore";
import { startCompareEventBus } from "../state/compareEventBus";
import { assessStrategies } from "../state/strategy";
import { formatBytes } from "../../../shared/format/bytes";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";

export function useCompareRun() {
  const isRunning = useCompareStore((s) => s.isRunning);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => { void startCompareEventBus(); }, []);

  const start = useCallback(async () => {
    const { selectedModels, prompt, systemPrompt, strategy, hardwareSnapshot,
      useSharedParams, baseParams, perModelParams, initRun, finishRun } = useCompareStore.getState();
    if (selectedModels.length === 0) { setStartError("Pick at least one model."); return; }
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
      // Resolve each model's own backend (coupled to its weight format) from the
      // installed list; fall back to Ollama if unknown.
      const installed = useInstalledModelsStore.getState().list;
      const backends = selectedModels.map(
        (m) => installed.find((i) => i.name === m.name)?.backend ?? "ollama",
      );
      await runCompare({
        models: selectedModels.map((m) => m.name),
        prompt,
        strategy,
        ...(system ? { system } : {}),
        params: baseParams,
        ...(useSharedParams ? {} : { perModelParams }),
        backends,
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
