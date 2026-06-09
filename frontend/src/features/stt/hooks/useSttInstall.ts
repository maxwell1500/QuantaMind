import { useCallback, useEffect } from "react";
import { downloadSttModel, cancelSttInstall } from "../../../shared/ipc/stt/stt";
import { friendlyInstallError } from "../../../shared/install_error";
import { useSttInstallStore } from "../state/sttInstallStore";
import { startSttInstallBus } from "../state/sttInstallBus";

/// Download a whisper model + the shared VAD as one operation. Progress arrives
/// via the install bus into `useSttInstallStore`; this hook owns begin/finish/
/// fail and exposes install + cancel. `onDone` refreshes the installed list.
export function useSttInstall(onDone?: () => void) {
  const begin = useSttInstallStore((s) => s.begin);
  const finish = useSttInstallStore((s) => s.finish);
  const fail = useSttInstallStore((s) => s.fail);
  const reset = useSttInstallStore((s) => s.reset);

  // Attach the progress listener once the tab is in use (idempotent).
  useEffect(() => {
    void startSttInstallBus();
  }, []);

  const install = useCallback(
    async (id: string) => {
      begin(id);
      try {
        await downloadSttModel(id);
        finish();
        onDone?.();
      } catch (e) {
        fail(friendlyInstallError(e));
      }
    },
    [begin, finish, fail, onDone],
  );

  const cancel = useCallback(async () => {
    try {
      await cancelSttInstall();
    } catch {
      /* best-effort */
    }
    reset();
  }, [reset]);

  return { install, cancel, reset };
}
