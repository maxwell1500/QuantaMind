import { useEffect } from "react";
import { Workspace } from "./features/workspace/components/Workspace";
import { CompareTab } from "./features/compare/components/CompareTab";
import { ModelsPage } from "./features/models/components/ModelsPage";
import { DownloadsPage } from "./features/models/components/DownloadsPage";
import { StoragePage } from "./features/models/components/StoragePage";
import { startInstalledModelsBus } from "./features/models/state/installedModelsBus";
import { useModelSettingsStore } from "./features/models/state/modelSettingsStore";
import { FeedbackButton } from "./features/feedback/components/FeedbackButton";
import { HelpPage } from "./features/help/components/HelpPage";
import { FilesPanel } from "./features/workspaces/components/FilesPanel";
import { useAutoSave } from "./features/workspaces/hooks/useAutoSave";
import { HistoryPanel } from "./features/history/components/HistoryPanel";
import { useHistoryStore } from "./features/history/state/historyStore";
import { ToastHost } from "./shared/ui/Toast";
import { RefreshButton } from "./shared/ui/RefreshButton";
import { useNavStore, type TopView } from "./shared/state/navStore";

const TABS: { id: TopView; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "compare", label: "Compare" },
  { id: "models", label: "Models" },
  { id: "downloads", label: "Downloads" },
  { id: "storage", label: "Storage" },
  { id: "help", label: "Help" },
];

const tabClass = (active: boolean) =>
  active
    ? "border-b-2 border-blue-600 px-3 py-1 text-sm font-medium"
    : "px-3 py-1 text-sm text-gray-600 hover:text-black";

export default function App() {
  const view = useNavStore((s) => s.topView);
  const setView = useNavStore((s) => s.setTopView);
  useEffect(() => {
    void startInstalledModelsBus();
    void useModelSettingsStore.getState().load().catch((e) => {
      console.error("model settings load failed:", e);
    });
  }, []);
  useAutoSave();
  const toggleHistory = useHistoryStore((s) => s.toggle);
  return (
    <main className="min-h-screen p-6 pb-14 font-sans space-y-3">
      <div className="flex items-center gap-2">
        <img src="/Small_logo.png" alt="QuantaMind" className="h-8 w-8 object-contain" />
        <h1 className="text-2xl font-semibold">QuantaMind</h1>
        <div className="ml-auto flex items-center gap-2">
          {view === "workspace" && (
            <button
              type="button"
              onClick={toggleHistory}
              className="text-sm text-gray-600 hover:text-black px-2 py-1"
              data-testid="history-toggle"
            >
              History
            </button>
          )}
          <RefreshButton />
        </div>
      </div>
      <nav className="flex gap-1 border-b" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={tabClass(view === t.id)}
            data-testid={`view-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div hidden={view !== "workspace"} data-testid="view-workspace" className="flex gap-4">
        <FilesPanel />
        <div className="flex-1 min-w-0"><Workspace /></div>
      </div>
      <div hidden={view !== "compare"} data-testid="view-compare"><CompareTab /></div>
      <div hidden={view !== "models"} data-testid="view-models"><ModelsPage /></div>
      <div hidden={view !== "downloads"} data-testid="view-downloads"><DownloadsPage /></div>
      <div hidden={view !== "storage"} data-testid="view-storage"><StoragePage /></div>
      <div hidden={view !== "help"} data-testid="view-help"><HelpPage /></div>
      <FeedbackButton />
      <HistoryPanel />
      <ToastHost />
    </main>
  );
}
