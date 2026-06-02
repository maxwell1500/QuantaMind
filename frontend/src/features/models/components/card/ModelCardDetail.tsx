import { open } from "@tauri-apps/plugin-shell";
import type { ModelCard } from "../../../../shared/ipc/models/hf_browse";

// The model card is rendered as a STRUCTURED DATA PANEL, not a document: badges
// + tags + the description, all controlled values mapped to native components
// (never injecting remote HTML). The full README is one click away on HF.
function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px]">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

export function ModelCardDetail({ repo, card }: { repo: string; card: ModelCard }) {
  return (
    <div className="space-y-2 text-sm" data-testid="model-card">
      <div className="flex flex-wrap gap-1.5">
        {card.pipeline_tag && <Badge label="task" value={card.pipeline_tag} />}
        {card.license && <Badge label="license" value={card.license} />}
        {card.base_model && <Badge label="base" value={card.base_model} />}
      </div>
      {card.description && (
        <p className="leading-relaxed text-gray-700 whitespace-pre-line" data-testid="model-card-desc">
          {card.description}
        </p>
      )}
      {card.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" data-testid="model-card-tags">
          {card.tags.slice(0, 20).map((t) => (
            <li key={t} className="rounded border px-1.5 py-0.5 text-[10px] text-gray-500">{t}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => void open(`https://huggingface.co/${repo}`)}
        data-testid="model-card-open"
        className="text-xs text-blue-700 underline"
      >
        Open full card on Hugging Face →
      </button>
    </div>
  );
}
