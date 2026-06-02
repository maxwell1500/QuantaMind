import { useState } from "react";
import { useHfModelCard } from "../../hooks/useHfModelCard";
import { ModelCardReader } from "./ModelCardReader";

function CardBody({ repo }: { repo: string }) {
  const { markdown, status } = useHfModelCard(repo);
  if (status === "loading") return <p className="text-xs text-gray-500">Loading model card…</p>;
  if (status === "none") return <p className="text-xs text-gray-500">No model card for this repo.</p>;
  if (status === "error" || !markdown)
    return <p className="text-xs text-red-600">Couldn't load the model card.</p>;
  return (
    <div className="mt-2 max-h-80 overflow-auto border rounded p-2" data-testid="model-card-body">
      <ModelCardReader markdown={markdown} />
    </div>
  );
}

/// Collapsible "Model card" section for a repo. Fetches only when opened.
export function ModelCardSection({ repo }: { repo: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="model-card-toggle"
        className="text-xs underline text-blue-700"
      >
        {open ? "Hide model card" : "Show model card"}
      </button>
      {open && <CardBody repo={repo} />}
    </div>
  );
}
