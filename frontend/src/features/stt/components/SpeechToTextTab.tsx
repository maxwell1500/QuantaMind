import { useWhisperEnv } from "../hooks/useWhisperEnv";
import { useSttCatalog } from "../hooks/useSttCatalog";
import { useSttInstall } from "../hooks/useSttInstall";
import { useHardwareSnapshot } from "../../models/hooks/useHardwareSnapshot";
import { SttSetupCard } from "./SttSetupCard";
import { SttCatalogTable } from "./SttCatalogTable";
import { SttServerPanel } from "./SttServerPanel";

/// The Speech-to-Text tab. Three states from the engine check: not installed →
/// setup card; installed but not runnable → reinstall card; ready → catalog +
/// server controls. Reachable in any state (so the setup guide always shows).
export function SpeechToTextTab() {
  const { env, loading, recheck, chooseFolder } = useWhisperEnv();
  const { catalog, installed, installedIds, refresh } = useSttCatalog();
  const { install, cancel } = useSttInstall(refresh);
  const { snapshot } = useHardwareSnapshot();

  if (!env || !env.found || !env.runnable) {
    if (loading && !env) {
      return (
        <p data-testid="stt-checking" className="text-xs text-gray-500">
          Checking for whisper.cpp…
        </p>
      );
    }
    return (
      <SttSetupCard
        notRunnable={!!env?.found && !env.runnable}
        detail={env?.error ?? null}
        loading={loading}
        onRecheck={() => void recheck()}
        onChooseFolder={() => void chooseFolder()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="stt-ready">
      <SttCatalogTable
        catalog={catalog}
        installedIds={installedIds}
        snapshot={snapshot}
        onInstall={(id) => void install(id)}
        onCancel={() => void cancel()}
      />
      <SttServerPanel installed={installed} />
    </div>
  );
}
