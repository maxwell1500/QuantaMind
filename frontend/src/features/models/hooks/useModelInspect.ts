import { useEffect, useState } from "react";
import { inspectModel, type ModelInspect } from "../../../shared/ipc/system/inspect";
import type { BackendKind } from "../../../shared/ipc/models/storage";

export type InspectStatus = "loading" | "ready" | "error";

/// Fetch /api/show metadata for an installed model. Re-runs when the model or
/// backend changes.
export function useModelInspect(model: string, backend: BackendKind): { data: ModelInspect | null; status: InspectStatus } {
  const [data, setData] = useState<ModelInspect | null>(null);
  const [status, setStatus] = useState<InspectStatus>("loading");
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);
    inspectModel(model, backend)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [model, backend]);
  return { data, status };
}
