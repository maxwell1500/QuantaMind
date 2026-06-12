import { useCallback, useEffect, useState } from "react";
import { historyList, type HistoryEntry } from "../../../shared/ipc/workspace/history";

/// Load persisted run history (via shared IPC, no cross-feature import) so the
/// Inspector can compare cold vs warm starts per model. Errors (e.g. no
/// workspace open) degrade to an empty list.
export function useRunHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const refresh = useCallback(async () => {
    try {
      setEntries(await historyList());
    } catch {
      setEntries([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { entries, refresh };
}
