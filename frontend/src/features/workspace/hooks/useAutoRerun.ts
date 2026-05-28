import { useEffect, useRef, useState } from "react";
import type { RunStatus } from "./useStreamingRun";

export const AUTO_RERUN_MS = 800;

type Args = {
  enabled: boolean;
  selectionId: string | null; // changes when a different prompt is opened
  runKey: string; // changes when prompt/system/params are edited
  status: RunStatus;
  canRun: boolean;
  onFire: () => void;
};

/// "Vite for AI": debounce edits and auto-run 800ms after typing stops.
/// Never fires on prompt selection (only on edits), never while a run is
/// in progress — instead it queues one re-run for when the run finishes.
export function useAutoRerun({ enabled, selectionId, runKey, status, canRun, onFire }: Args) {
  const [pending, setPending] = useState(false);
  const lastSelection = useRef<string | null>(null);
  const lastKey = useRef<string>("");
  const dirtyDuringRun = useRef(false);
  const fire = useRef(onFire);
  fire.current = onFire;

  useEffect(() => {
    lastSelection.current = selectionId;
    lastKey.current = runKey;
    setPending(false);
    dirtyDuringRun.current = false;
  }, [selectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !canRun) { setPending(false); return; }
    if (selectionId !== lastSelection.current) return;
    if (runKey === lastKey.current) return;
    lastKey.current = runKey;
    if (status === "running") { dirtyDuringRun.current = true; return; }
    setPending(true);
    const t = setTimeout(() => { setPending(false); fire.current(); }, AUTO_RERUN_MS);
    return () => clearTimeout(t);
  }, [runKey, enabled, canRun, status, selectionId]);

  useEffect(() => {
    if (status === "running" || !dirtyDuringRun.current) return;
    dirtyDuringRun.current = false;
    if (!enabled || !canRun) { setPending(false); return; }
    setPending(true);
    const t = setTimeout(() => { setPending(false); fire.current(); }, AUTO_RERUN_MS);
    return () => clearTimeout(t);
  }, [status, enabled, canRun]);

  return { pending };
}
