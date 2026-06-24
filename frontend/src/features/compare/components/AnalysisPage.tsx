import { useState } from "react";
import { AnalysisTab } from "./AnalysisTab";
import { QuantPage } from "../../quant/components/QuantPage";

type SubTab = "analysis" | "quant";
const TABS: { id: SubTab; label: string }[] = [
  { id: "analysis", label: "Analysis" },
  { id: "quant", label: "Quant" },
];

const subTabClass = (active: boolean) =>
  `px-4 py-2 text-sm ${active ? "border-b-2 border-blue-600 font-medium" : "text-gray-600 hover:text-ink"}`;

/// Hosts the read-only Analysis results and the Quantization Comparison as two
/// sub-tabs. Quant lives here (not as a top-level tab) because it is one lens of
/// analysis. The active sub-tab is local state — nothing deep-links into it.
export function AnalysisPage() {
  const [tab, setTab] = useState<SubTab>("analysis");
  return (
    <section data-testid="page-analysis" className="flex flex-col gap-3 h-full">
      <nav className="flex border-b" role="tablist" data-testid="analysis-tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={subTabClass(tab === t.id)}
            data-testid={`analysis-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        {tab === "analysis" && <AnalysisTab />}
        {tab === "quant" && <QuantPage />}
      </main>
    </section>
  );
}
