import { useEffect } from "react";
import { Workspace } from "./features/workspace/components/Workspace";
import { AnalysisTab } from "./features/compare/components/AnalysisTab";
import { InspectorPage } from "./features/inspector/components/InspectorPage";
import { SettingsPage } from "./features/settings/components/SettingsPage";
import { ModelsPage } from "./features/models/components/ModelsPage";
import { DownloadsPage } from "./features/models/components/DownloadsPage";
import { EvalPage } from "./features/eval/components/EvalPage";
import { AuditPage } from "./features/audit/components/AuditPage";
import { QuantPage } from "./features/quant/components/QuantPage";
import { startInstalledModelsBus } from "./features/models/state/installedModelsBus";
import { useModelSettingsStore } from "./features/models/state/modelSettingsStore";
import { FeedbackButton } from "./features/feedback/components/FeedbackButton";
import { HelpPage } from "./features/help/components/HelpPage";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { useAutoSave } from "./features/workspaces/hooks/useAutoSave";
import { HistoryPanel } from "./features/history/components/HistoryPanel";
import { StartupUpdate } from "./features/help/components/StartupUpdate";
import { OnboardingCoach } from "./features/onboarding/components/OnboardingCoach";
import { AppHeader } from "./AppHeader";
import { useGlobalHotkeys } from "./appHotkeys";
import { CheatsheetModal } from "./shared/ui/CheatsheetModal";
import { ToastHost } from "./shared/ui/Toast";
import { useNavStore, type TopView } from "./shared/state/navStore";

const TABS: { id: TopView; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "compare", label: "Compare" },
  { id: "inspector", label: "Inspector" },
  { id: "models", label: "Models" },
  { id: "downloads", label: "Downloads" },
  { id: "eval", label: "Eval" },
  { id: "audit", label: "Audit" },
  { id: "quant", label: "Quant" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help" },
];

const tabClass = (active: boolean) =>
  active
    ? "border-b-2 border-blue-600 px-3 py-1 text-sm font-medium"
    : "px-3 py-1 text-sm text-gray-600 hover:text-ink";

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
  useGlobalHotkeys();
  return (
    <main className="min-h-screen p-6 pb-14 font-sans space-y-3">
      <AppHeader />
      <OnboardingCoach />
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
      <div hidden={view !== "workspace"} data-testid="view-workspace">
        <div className="flex gap-4">
          <WorkspaceSidebar />
          <div className="flex-1 min-w-0"><Workspace /></div>
        </div>
      </div>
      <div hidden={view !== "compare"} data-testid="view-compare"><AnalysisTab /></div>
      <div hidden={view !== "inspector"} data-testid="view-inspector"><InspectorPage /></div>
      <div hidden={view !== "models"} data-testid="view-models"><ModelsPage /></div>
      <div hidden={view !== "downloads"} data-testid="view-downloads"><DownloadsPage /></div>
      <div hidden={view !== "eval"} data-testid="view-eval"><EvalPage /></div>
      <div hidden={view !== "audit"} data-testid="view-audit"><AuditPage /></div>
      <div hidden={view !== "quant"} data-testid="view-quant"><QuantPage /></div>
      <div hidden={view !== "settings"} data-testid="view-settings"><SettingsPage /></div>
      <div hidden={view !== "help"} data-testid="view-help"><HelpPage /></div>
      <FeedbackButton />
      <HistoryPanel />
      <CheatsheetModal />
      <StartupUpdate />
      <ToastHost />
    </main>
  );
}
