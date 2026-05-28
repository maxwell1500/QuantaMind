import { useHistoryStore } from "./features/history/state/historyStore";
import { useUiStore } from "./shared/state/uiStore";
import { useNavStore } from "./shared/state/navStore";
import { RefreshButton } from "./shared/ui/RefreshButton";

const btn = "text-sm text-gray-600 hover:text-black px-2 py-1";

export function AppHeader() {
  const workspace = useNavStore((s) => s.topView) === "workspace";
  const toggleHistory = useHistoryStore((s) => s.toggle);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  return (
    <div className="flex items-center gap-2">
      <img src="/Small_logo.png" alt="QuantaMind" className="h-8 w-8 object-contain" />
      <h1 className="text-2xl font-semibold">QuantaMind</h1>
      <div className="ml-auto flex items-center gap-2">
        {workspace && (
          <button type="button" onClick={toggleHistory} className={btn} data-testid="history-toggle">
            History
          </button>
        )}
        <button
          type="button"
          onClick={toggleSettings}
          className={btn}
          data-testid="settings-toggle"
          aria-label="Settings"
        >
          ⚙
        </button>
        <RefreshButton />
      </div>
    </div>
  );
}
