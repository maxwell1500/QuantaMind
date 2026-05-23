import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { listModels } from "../../../shared/ipc/client";
import {
  inspectGguf,
  installLocalGguf,
  type GgufMetadata,
} from "../../../shared/ipc/gguf";
import {
  EVENT_LOCAL_INSTALL_PROGRESS,
  LocalInstallPhaseSchema,
  type LocalInstallPhase,
} from "../../../shared/ipc/local_install";
import { useModelStore } from "../state/modelStore";
import { formatIpcError } from "../../../shared/ipc/error";

const defaultName = (path: string) =>
  (path.split("/").pop() ?? path).replace(/\.gguf$/i, "").replace(/[^A-Za-z0-9_\-.:]/g, "-");

export function useLocalImport() {
  const pendingPath = useModelStore((s) => s.pendingLocalPath);
  const setPendingPath = useModelStore((s) => s.setPendingLocalPath);
  const [path, setPath] = useState<string | null>(null);
  const [meta, setMeta] = useState<GgufMetadata | null>(null);
  const [name, setName] = useState("");
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<LocalInstallPhase | null>(null);

  useEffect(() => {
    listModels().then((m) => setInstalled(new Set(m))).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const u = await listen(EVENT_LOCAL_INSTALL_PROGRESS, (e) => {
        const p = LocalInstallPhaseSchema.safeParse(e.payload);
        if (p.success) setPhase(p.data);
      });
      if (cancelled) u(); else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const choose = useCallback(async (p: string) => {
    setError(null); setPath(p); setName(defaultName(p));
    try { setMeta(await inspectGguf(p)); }
    catch (e) { setError(formatIpcError(e)); setMeta(null); }
  }, []);

  useEffect(() => {
    if (pendingPath && pendingPath !== path) {
      void choose(pendingPath);
      setPendingPath(null);
    }
  }, [pendingPath, path, choose, setPendingPath]);

  const browse = useCallback(async () => {
    const picked = await open({ multiple: false, filters: [{ name: "GGUF", extensions: ["gguf"] }] });
    if (typeof picked === "string") await choose(picked);
  }, [choose]);

  const cancel = useCallback(() => {
    setPath(null); setMeta(null); setName(""); setError(null); setPhase(null);
  }, []);

  const doImport = useCallback(async () => {
    if (!path) return;
    setBusy(true); setError(null); setPhase(null);
    try { await installLocalGguf(path, name); cancel(); }
    catch (e) { setError(formatIpcError(e)); }
    finally { setBusy(false); setPhase(null); }
  }, [path, name, cancel]);

  return {
    path, meta, name, error, busy, phase,
    conflict: installed.has(name),
    setName, browse, cancel, doImport,
  };
}
