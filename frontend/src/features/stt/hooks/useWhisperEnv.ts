import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { checkWhisperEnv, type WhisperEnv } from "../../../shared/ipc/stt/stt";
import { getUserSettings, setUserSettings } from "../../../shared/ipc/settings/userSettings";

/// Is the whisper.cpp engine installed AND runnable? Checks on mount and on
/// demand (Re-check). `recheck` is guarded by a busy flag so rapid clicks while
/// the disk lookup + dry-run run can't flicker the UI. `chooseFolder` persists a
/// manually-located install to settings so it's remembered across launches.
export function useWhisperEnv() {
  const [env, setEnv] = useState<WhisperEnv | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const recheck = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      setEnv(await checkWhisperEnv());
    } catch {
      setEnv({ found: false, dir: null, runnable: false, error: null });
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const chooseFolder = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose the folder containing whisper-server",
    });
    if (typeof picked !== "string") return;
    const settings = await getUserSettings();
    await setUserSettings({ ...settings, stt_engine_dir: picked });
    await recheck();
  }, [recheck]);

  return { env, loading, recheck, chooseFolder };
}
