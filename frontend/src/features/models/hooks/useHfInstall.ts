import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  cancelHfInstall,
  EVENT_HF_PROGRESS,
  HfPhaseSchema,
  installHfGguf,
  type HfPhase,
} from "../../../shared/ipc/hf_install";

export type HfStatus = "idle" | "downloading" | "installing" | "success" | "error";

export interface HfInstallState {
  status: HfStatus;
  phase: HfPhase | null;
  percent: number;
  error: string | null;
}

const IDLE: HfInstallState = { status: "idle", phase: null, percent: 0, error: null };

export function useHfInstall() {
  const [state, setState] = useState<HfInstallState>(IDLE);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const u = await listen<unknown>(EVENT_HF_PROGRESS, (e) => {
        const p = HfPhaseSchema.safeParse(e.payload);
        if (!p.success) {
          console.error("invalid hf-progress payload", p.error.issues);
          return;
        }
        setState((s) => {
          if (p.data.phase === "downloading") {
            const total = p.data.bytes_total;
            const done = p.data.bytes_completed;
            const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
            return { ...s, status: "downloading", phase: p.data, percent };
          }
          return { ...s, status: "installing", phase: p.data };
        });
      });
      if (cancelled) u(); else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const install = useCallback(async (repo: string, filename: string, name: string) => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: "downloading", phase: null, percent: 0, error: null });
    try {
      await installHfGguf(repo, filename, name);
      setState((s) => ({ ...s, status: "success", error: null }));
    } catch (e) {
      setState((s) => ({
        ...s,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  const cancel = useCallback(async () => {
    try { await cancelHfInstall(); } catch { /* best-effort */ }
  }, []);

  return { state, install, cancel, reset };
}
