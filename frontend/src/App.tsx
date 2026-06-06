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
import { AgentReportPage } from "./features/agentReport/components/AgentReportPage";
import { startInstalledModelsBus } from "./features/models/state/installedModelsBus";
import { useModelSettingsStore } from "./features/models/state/modelSettingsStore";
import { FeedbackButton } from "./features/feedback/components/FeedbackButton";
import { DocPage } from "./features/doc/components/DocPage";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { useAutoSave } from "./features/workspaces/hooks/useAutoSave";
import { HistoryPanel } from "./features/history/components/HistoryPanel";
import { StartupUpdate } from "./features/doc/components/StartupUpdate";
import { OnboardingCoach } from "./features/onboarding/components/OnboardingCoach";
import { AppHeader } from "./AppHeader";
import { useGlobalHotkeys } from "./appHotkeys";
import { CheatsheetModal } from "./shared/ui/CheatsheetModal";
import { ToastHost } from "./shared/ui/Toast";
import { useNavStore, type TopView } from "./shared/state/navStore";

const TABS: { id: TopView; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "compare", label: "Analysis" },
  { id: "inspector", label: "Inspector" },
  { id: "models", label: "Models" },
  { id: "downloads", label: "Downloads" },
  { id: "eval", label: "Eval" },
  { id: "audit", label: "Audit" },
  { id: "quant", label: "Quant" },
  { id: "agentReport", label: "Agent Report" },
  { id: "settings", label: "Settings" },
  { id: "doc", label: "Doc" },
];

const tabClass = (active: boolean) =>
  active
    ? "bg-white text-slate-900 shadow-sm border border-slate-200/60 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all"
    : "px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white/40 rounded-lg transition-all";

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
    <main className="min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans space-y-6">
      <AppHeader />
      <OnboardingCoach />
      <nav className="flex items-center gap-1.5 bg-slate-100/70 p-1.5 rounded-xl border border-slate-200/40 w-fit max-w-full overflow-x-auto scrollbar-none" role="tablist">

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
      <div hidden={view !== "agentReport"} data-testid="view-agentReport"><AgentReportPage /></div>
      <div hidden={view !== "settings"} data-testid="view-settings"><SettingsPage /></div>
      <div hidden={view !== "doc"} data-testid="view-doc"><DocPage /></div>
      <FeedbackButton />
      <HistoryPanel />
      <CheatsheetModal />
      <StartupUpdate />
      <ToastHost />
    </main>
  );
}
