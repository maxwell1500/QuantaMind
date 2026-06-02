import { useEffect, useRef, useState } from "react";
import { hfSearch, type HfSearchHit, type RepoKind } from "../../../../shared/ipc/models/hf_browse";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { HuggingFaceRepoDetail } from "../HuggingFaceRepoDetail";
import { MlxRepoDetail } from "../MlxRepoDetail";
import { useModelStore } from "../../state/modelStore";

const DEBOUNCE_MS = 300;
type Status = "idle" | "loading" | "ready" | "error";

const KINDS: { id: RepoKind; label: string }[] = [
  { id: "gguf", label: "GGUF" },
  { id: "mlx", label: "MLX" },
];

export function HuggingFaceTab() {
  const query = useModelStore((s) => s.hfSearchQuery);
  const setQuery = useModelStore((s) => s.setHfSearchQuery);
  const selected = useModelStore((s) => s.hfSelectedRepo);
  const setSelected = useModelStore((s) => s.setHfSelectedRepo);
  const kind = useModelStore((s) => s.hfRepoKind);
  const setKind = useModelStore((s) => s.setHfRepoKind);
  const [hits, setHits] = useState<HfSearchHit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); setStatus("idle"); setError(null); return; }
    const me = ++seq.current;
    setStatus("loading"); setError(null);
    const t = setTimeout(() => {
      hfSearch(q, 30, kind)
        .then((out) => {
          if (seq.current !== me) return;
          setHits(out); setStatus("ready");
        })
        .catch((e) => {
          if (seq.current !== me) return;
          setError(formatIpcError(e)); setStatus("error");
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, kind]);

  if (selected) {
    return kind === "mlx" ? (
      <MlxRepoDetail repo={selected} onBack={() => setSelected(null)} />
    ) : (
      <HuggingFaceRepoDetail repo={selected} onBack={() => setSelected(null)} />
    );
  }
  return (
    <div data-testid="tab-huggingface" className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <input
          type="search"
          aria-label="Search Hugging Face"
          placeholder={kind === "mlx" ? "Search Hugging Face models tagged MLX…" : "Search Hugging Face models with GGUF files…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border rounded px-2 py-1 text-sm"
        />
        <div className="flex rounded border overflow-hidden text-xs" role="group" aria-label="Model format">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              data-testid={`hf-kind-${k.id}`}
              className={`px-2.5 py-1 ${kind === k.id ? "bg-blue-600 text-white" : "bg-surface hover:bg-gray-100"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto grid grid-cols-2 gap-2" data-testid="hf-grid">
        {status === "idle" && (
          <div className="col-span-2 text-xs text-gray-500 py-6 text-center" data-testid="hf-idle">
            Start typing to search Hugging Face for {kind === "mlx" ? "MLX" : "GGUF"} models.
          </div>
        )}
        {status === "loading" && (
          <div className="col-span-2 text-xs text-gray-500 py-6 text-center" data-testid="hf-loading">
            Searching…
          </div>
        )}
        {status === "error" && (
          <div className="col-span-2 text-xs text-red-600 py-6 text-center" role="alert" data-testid="hf-error-search">
            {error}
            <button type="button" onClick={() => setQuery(query + " ")} className="ml-2 underline">Retry</button>
          </div>
        )}
        {status === "ready" && hits.length === 0 && (
          <div className="col-span-2 text-xs text-gray-500 py-6 text-center" data-testid="hf-no-results">
            No models match. Try a different keyword.
          </div>
        )}
        {status === "ready" && hits.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setSelected(h.id)}
            data-testid={`hf-card-${h.id}`}
            className="border rounded p-3 text-left hover:bg-gray-50"
          >
            <div className="text-sm font-medium break-all">{h.id}</div>
            <div className="text-xs text-gray-500 mt-1">
              {h.downloads.toLocaleString()} downloads · {h.likes.toLocaleString()} likes
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {h.tags.slice(0, 4).join(" · ")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
