import { useState } from "react";
import { Workspace } from "./features/workspace/components/Workspace";
import { CompareTab } from "./features/compare/components/CompareTab";

type View = "workspace" | "compare";

const tabClass = (active: boolean) =>
  active
    ? "border-b-2 border-blue-600 px-3 py-1 text-sm font-medium"
    : "px-3 py-1 text-sm text-gray-600 hover:text-black";

export default function App() {
  const [view, setView] = useState<View>("workspace");
  return (
    <main className="min-h-screen p-6 pb-14 font-sans space-y-3">
      <div className="flex items-center gap-2">
        <img src="/Small_logo.png" alt="QuantaMind" className="h-8 w-8 object-contain" />
        <h1 className="text-2xl font-semibold">QuantaMind</h1>
      </div>
      <nav className="flex gap-1 border-b" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "workspace"}
          onClick={() => setView("workspace")}
          className={tabClass(view === "workspace")}
          data-testid="view-tab-workspace"
        >
          Workspace
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "compare"}
          onClick={() => setView("compare")}
          className={tabClass(view === "compare")}
          data-testid="view-tab-compare"
        >
          Compare
        </button>
      </nav>
      <div hidden={view !== "workspace"} data-testid="view-workspace">
        <Workspace />
      </div>
      <div hidden={view !== "compare"} data-testid="view-compare">
        <CompareTab />
      </div>
    </main>
  );
}
