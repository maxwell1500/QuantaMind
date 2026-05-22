import { useEffect, useMemo, useState } from "react";
import { listModels } from "../../../../shared/ipc/client";
import { OllamaCatalog, type Tag } from "../../data/ollama-catalog";
import { ModelCard } from "../ModelCard";

const PILLS: Array<{ id: Tag | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "chat", label: "Chat" },
  { id: "coding", label: "Coding" },
  { id: "embedding", label: "Embedding" },
  { id: "vision", label: "Vision" },
  { id: "small", label: "Small (<4B)" },
  { id: "medium", label: "Medium (4–13B)" },
  { id: "large", label: "Large (>13B)" },
];

export function OllamaLibraryTab() {
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<Set<Tag>>(new Set());
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then((m) => { if (!cancelled) setInstalled(new Set(m)); })
      .catch(() => { /* picker surfaces the error; tab stays usable */ });
    return () => { cancelled = true; };
  }, []);

  const togglePill = (tag: Tag) =>
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return OllamaCatalog.filter((m) => {
      if (q) {
        const hay = `${m.name} ${m.description} ${m.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const t of activeTags) if (!m.tags.includes(t)) return false;
      return true;
    });
  }, [search, activeTags]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <input
        type="search"
        aria-label="Search Ollama library"
        placeholder="Search Ollama library..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <div className="flex flex-wrap gap-1" data-testid="pills">
        {PILLS.map((p) => {
          const active = p.id === "all"
            ? activeTags.size === 0
            : activeTags.has(p.id as Tag);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => p.id === "all" ? setActiveTags(new Set()) : togglePill(p.id as Tag)}
              className={`text-xs px-2 py-1 rounded border ${active ? "bg-blue-600 text-white" : ""}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div
        className="flex-1 overflow-auto grid grid-cols-2 gap-2"
        data-testid="model-grid"
      >
        {visible.map((m) => (
          <ModelCard key={m.name} model={m} isInstalled={installed.has(m.name)} />
        ))}
      </div>
    </div>
  );
}
