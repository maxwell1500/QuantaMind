import { useEffect, useRef } from "react";
import { useRunController } from "../state/runController";

/// Publish the active run surface's state + handlers to the header Play/Stop.
/// run/stop are read through refs so their identity stays stable across renders
/// (the effect only re-fires when running/canRun change); cleared on unmount.
export function useRegisterRun(running: boolean, canRun: boolean, run: () => void, stop: () => void) {
  const runRef = useRef(run);
  runRef.current = run;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    useRunController.getState().register({
      running,
      canRun,
      run: () => runRef.current(),
      stop: () => stopRef.current(),
    });
  }, [running, canRun]);
  useEffect(() => () => useRunController.getState().clear(), []);
}
