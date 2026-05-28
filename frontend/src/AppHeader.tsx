import { useHistoryStore } from "./features/history/state/historyStore";
import { useNavStore } from "./shared/state/navStore";
import { OllamaControl } from "./features/workspace/components/OllamaControl";

const btn = "text-sm text-gray-600 hover:text-ink px-2 py-1";

export function AppHeader() {
  const workspace = useNavStore((s) => s.topView) === "workspace";
  const canGoBack = useNavStore((s) => s.history.length > 0);
  const goBack = useNavStore((s) => s.goBack);
  const toggleHistory = useHistoryStore((s) => s.toggle);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goBack}
        disabled={!canGoBack}
        aria-label="Back"
        data-testid="nav-back"
        className="text-lg px-2 py-1 text-gray-600 hover:text-ink disabled:opacity-30 disabled:cursor-default"
      >
        ‹
      </button>
      <img src="/Small_logo.png" alt="QuantaMind" className="h-8 w-8 object-contain" />
      <h1 className="text-2xl font-semibold">QuantaMind</h1>
      <div className="ml-auto flex items-center gap-2">
        {workspace && (
          <button type="button" onClick={toggleHistory} className={btn} data-testid="history-toggle">
            History
          </button>
        )}
        <OllamaControl />
      </div>
    </div>
  );
}
