import { useEffect, useState } from "react";
import { llamaServerInfo, type LlamaServerInfo } from "../../../../shared/ipc/models/llama_start";
import { useBackendStore } from "../../../../shared/state/backendStore";
import { formatBytes } from "../../../../shared/format/bytes";

/// A one-time **spawn** readout for llama.cpp, shown only when it's the active
/// backend. Unlike Ollama (which loads per-request and surfaces load as a phase),
/// llama.cpp loads the model once at server spawn and keeps it resident — so this
/// is a server-startup fact, deliberately separate from the per-request TTFT phase
/// bar, not faked into it. Nothing renders when no server is up or the readout is
/// absent (never a fabricated number).
export function LlamaServerReadout() {
  const selectedBackend = useBackendStore((s) => s.selectedBackend);
  const llamaHealthy = useBackendStore((s) => s.llamaHealthy);
  const [info, setInfo] = useState<LlamaServerInfo>(null);

  useEffect(() => {
    if (selectedBackend !== "llama_cpp") {
      setInfo(null);
      return;
    }
    let cancelled = false;
    llamaServerInfo()
      .then((r) => !cancelled && setInfo(r))
      .catch(() => !cancelled && setInfo(null));
    return () => {
      cancelled = true;
    };
  }, [selectedBackend, llamaHealthy]);

  if (selectedBackend !== "llama_cpp" || !info) return null;

  const size = info.model_bytes != null ? formatBytes(info.model_bytes) : null;
  const loadS = (info.load_ms / 1000).toFixed(1);
  return (
    <div
      data-testid="llama-spawn-readout"
      className="text-xs text-gray-500 border rounded px-3 py-2 bg-gray-50"
      title="llama.cpp loads the model once at server start and keeps it resident — this is a one-time startup cost, not part of each request's TTFT."
    >
      <span className="font-semibold text-gray-600">llama.cpp server</span>
      {size && <> · model {size}</>} · loaded in {loadS}s at startup
      <span className="text-gray-400"> (one-time; not a per-request phase)</span>
    </div>
  );
}
