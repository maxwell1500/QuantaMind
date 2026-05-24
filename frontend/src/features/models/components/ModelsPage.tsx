import { useEffect } from "react";
import { useModelStore, type TabId } from "../state/modelStore";
import { useNavStore } from "../../../shared/state/navStore";
import { OllamaLibraryTab } from "./tabs/OllamaLibraryTab";
import { HuggingFaceTab } from "./tabs/HuggingFaceTab";
import { LocalFileTab } from "./tabs/LocalFileTab";

type Tab = { id: Extract<TabId, "ollama" | "huggingface" | "local">; label: string };
const TABS: Tab[] = [
  { id: "ollama", label: "Ollama Library" },
  { id: "huggingface", label: "Hugging Face" },
  { id: "local", label: "Local File" },
];

const subTabClass = (active: boolean) =>
  `px-4 py-2 text-sm ${active ? "border-b-2 border-blue-600 font-medium" : "text-gray-600 hover:text-black"}`;

export function ModelsPage() {
  const activeTab = useModelStore((s) => s.activeTab);
  const setActiveTab = useModelStore((s) => s.setActiveTab);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only honor Cmd+1/2/3 when the user is actually on the Models top tab.
      if (useNavStore.getState().topView !== "models") return;
      if (!e.metaKey || !/^[1-3]$/.test(e.key)) return;
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      setActiveTab(TABS[idx].id);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setActiveTab]);

  return (
    <section data-testid="page-models" className="flex flex-col gap-3 h-full">
      <h2 className="text-lg font-semibold">Add Model</h2>
      <nav className="flex border-b" role="tablist" data-testid="models-tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={subTabClass(activeTab === t.id)}
            data-testid={`models-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        {activeTab === "ollama" && <OllamaLibraryTab />}
        {activeTab === "huggingface" && <HuggingFaceTab />}
        {activeTab === "local" && <LocalFileTab />}
      </main>
    </section>
  );
}
