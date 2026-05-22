import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  cancelHfInstall,
  EVENT_HF_PROGRESS,
  HfPhaseSchema,
  installHfGguf,
  type HfPhase,
} from "../../../shared/ipc/hf_install";
import { formatIpcError } from "../../../shared/ipc/error";
import { useModelStore } from "../state/modelStore";

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
  const activeName = useRef<string | null>(null);
  const upsert = useModelStore((s) => s.upsertDownload);

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
        const name = activeName.current;
        setState((s) => {
          if (p.data.phase === "downloading") {
            const total = p.data.bytes_total;
            const done = p.data.bytes_completed;
            const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
            if (name) upsert({
              id: name, source: "huggingface", name,
              status: "downloading", percent,
              bytesCompleted: done, bytesTotal: total,
            });
            return { ...s, status: "downloading", phase: p.data, percent };
          }
          if (name) upsert({
            id: name, source: "huggingface", name,
            status: "installing", percent: 100,
          });
          return { ...s, status: "installing", phase: p.data };
        });
      });
      if (cancelled) u(); else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [upsert]);

  const install = useCallback(async (repo: string, filename: string, name: string) => {
    if (busy.current) return;
    busy.current = true;
    activeName.current = name;
    setState({ status: "downloading", phase: null, percent: 0, error: null });
    upsert({ id: name, source: "huggingface", name, status: "downloading", percent: 0 });
    try {
      await installHfGguf(repo, filename, name);
      setState((s) => ({ ...s, status: "success", error: null }));
      upsert({ id: name, source: "huggingface", name, status: "success", percent: 100 });
    } catch (e) {
      const msg = formatIpcError(e);
      setState((s) => ({ ...s, status: "error", error: msg }));
      upsert({ id: name, source: "huggingface", name, status: "error", percent: 0, error: msg });
    } finally {
      busy.current = false;
    }
  }, [upsert]);

  const reset = useCallback(() => setState(IDLE), []);
  const cancel = useCallback(async () => {
    try { await cancelHfInstall(); } catch { /* best-effort */ }
    const name = activeName.current;
    if (name) upsert({ id: name, source: "huggingface", name, status: "cancelled", percent: 0 });
  }, [upsert]);

  return { state, install, cancel, reset };
}
