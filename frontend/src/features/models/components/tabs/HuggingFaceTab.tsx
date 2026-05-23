import { useMemo, useState } from "react";
import { HuggingFaceCatalog, type HfRepoEntry } from "../../data/huggingface-catalog";
import { HuggingFaceRepoDetail } from "../HuggingFaceRepoDetail";

export function HuggingFaceTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HfRepoEntry | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return HuggingFaceCatalog;
    return HuggingFaceCatalog.filter((e) => {
      const hay = `${e.repo} ${e.baseModel} ${e.family} ${e.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [search]);

  if (selected) {
    return <HuggingFaceRepoDetail entry={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div data-testid="tab-huggingface" className="flex flex-col gap-3 h-full">
      <input
        type="search"
        aria-label="Search Hugging Face"
        placeholder="Search HF GGUF repos…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <div className="flex-1 overflow-auto grid grid-cols-2 gap-2" data-testid="hf-grid">
        {visible.length === 0 ? (
          <div className="col-span-2 text-xs text-gray-500 py-6 text-center" data-testid="hf-no-results">
            No repos match. Try a different keyword.
          </div>
        ) : visible.map((e) => (
          <button
            key={e.repo}
            type="button"
            onClick={() => setSelected(e)}
            data-testid={`hf-card-${e.repo}`}
            className="border rounded p-3 text-left hover:bg-gray-50"
          >
            <div className="text-sm font-medium">{e.baseModel}</div>
            <div className="text-xs text-gray-500">{e.repo}</div>
            <div className="text-xs text-gray-700 mt-1">{e.description}</div>
            <div className="text-xs text-gray-500 mt-1">{e.variants.length} variant{e.variants.length > 1 ? "s" : ""} · {e.license}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
