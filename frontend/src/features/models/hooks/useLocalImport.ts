import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listModels } from "../../../shared/ipc/client";
import {
  inspectGguf,
  installLocalGguf,
  type GgufMetadata,
} from "../../../shared/ipc/gguf";
import { useModelStore } from "../state/modelStore";
import { formatIpcError } from "../../../shared/ipc/error";
import { startDownloadEventBus } from "../state/downloadEventBus";

const defaultName = (path: string) =>
  (path.split("/").pop() ?? path).replace(/\.gguf$/i, "").replace(/[^A-Za-z0-9_\-.:]/g, "-");

export function useLocalImport() {
  const pendingPath = useModelStore((s) => s.pendingLocalPath);
  const setPendingPath = useModelStore((s) => s.setPendingLocalPath);
  const activeLocalName = useModelStore((s) => s.activeLocalName);
  const setActiveLocalName = useModelStore((s) => s.setActiveLocalName);
  const entry = useModelStore((s) => (activeLocalName ? s.downloads[activeLocalName] : null));
  const [path, setPath] = useState<string | null>(null);
  const [meta, setMeta] = useState<GgufMetadata | null>(null);
  const [name, setName] = useState("");
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void startDownloadEventBus(); }, []);

  useEffect(() => {
    listModels().then((m) => setInstalled(new Set(m))).catch(() => {});
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
    setPath(null); setMeta(null); setName(""); setError(null);
    setActiveLocalName(null);
  }, [setActiveLocalName]);

  const upsert = useModelStore((st) => st.upsertDownload);
  const doImport = useCallback(async () => {
    if (!path) return;
    setError(null);
    setActiveLocalName(name);
    try {
      await installLocalGguf(path, name);
      upsert({ id: name, source: "local", name, status: "success", percent: 100 });
      cancel();
    } catch (e) {
      const msg = formatIpcError(e);
      setError(msg);
      upsert({ id: name, source: "local", name, status: "error", percent: 0, error: msg });
      setActiveLocalName(null);
    }
  }, [path, name, cancel, setActiveLocalName, upsert]);

  const busy = !!entry && entry.status === "installing";
  const percent = entry?.percent ?? 0;
  const phaseLabel = entry?.phaseLabel ?? null;

  return {
    path, meta, name, error, busy, percent, phaseLabel,
    conflict: installed.has(name),
    setName, browse, cancel, doImport,
  };
}
