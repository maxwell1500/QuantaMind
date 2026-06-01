import { useEffect, useState } from "react";
import {
  getHardwareSnapshot,
  type HardwareSnapshot,
} from "../../../shared/ipc/compare/hardware";

/// Fetch the hardware snapshot once for the model browser's fit badges. Null
/// until loaded or if the probe fails (the table then omits the Fit column
/// rather than guessing).
export function useHardwareSnapshot(): { snapshot: HardwareSnapshot | null } {
  const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    getHardwareSnapshot()
      .then((s) => !cancelled && setSnapshot(s))
      .catch(() => !cancelled && setSnapshot(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return { snapshot };
}
