import { useEffect, useRef } from "react";
import { useModelStore, type TabId } from "../state/modelStore";
import { OllamaLibraryTab } from "./tabs/OllamaLibraryTab";
import { HuggingFaceTab } from "./tabs/HuggingFaceTab";
import { LocalFileTab } from "./tabs/LocalFileTab";

type Props = { isOpen: boolean; onClose: () => void };

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "ollama", label: "Ollama Library" },
  { id: "huggingface", label: "Hugging Face" },
  { id: "local", label: "Local File" },
];
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function AddModelModal({ isOpen, onClose }: Props) {
  const activeTab = useModelStore((s) => s.activeTab);
  const setActiveTab = useModelStore((s) => s.setActiveTab);
  const installInFlight = useModelStore((s) => s.installInFlight);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.metaKey && /^[1-3]$/.test(e.key)) {
        e.preventDefault();
        setActiveTab(TABS[parseInt(e.key, 10) - 1].id);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    queueMicrotask(() =>
      modalRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(),
    );
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocus.current?.focus();
    };
  }, [isOpen, onClose, setActiveTab]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        data-testid="add-model-modal"
        className="bg-white rounded-lg shadow-xl w-[720px] h-[540px] flex flex-col"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 id="add-model-title" className="text-lg font-semibold">Add Model</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-gray-500 hover:text-black">
            ×
          </button>
        </header>
        <nav className="flex border-b" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm ${activeTab === tab.id ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-auto p-4">
          {activeTab === "ollama" && <OllamaLibraryTab />}
          {activeTab === "huggingface" && <HuggingFaceTab />}
          {activeTab === "local" && <LocalFileTab />}
        </main>
        <footer className="px-4 py-2 border-t text-xs text-gray-500" data-testid="modal-footer">
          {installInFlight
            ? `Installing ${installInFlight.name} · ${installInFlight.progress}%`
            : ""}
        </footer>
      </div>
    </div>
  );
}
