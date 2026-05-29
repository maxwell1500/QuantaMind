import { useEffect, useState } from "react";
import { listPromptTemplates, type PromptTemplate } from "../ipc/prompts/templates";

/** A dropdown of bundled prompt templates; selecting one inserts its body. */
export function PromptTemplatePicker({ onInsert }: { onInsert: (body: string) => void }) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  useEffect(() => {
    listPromptTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  if (templates.length === 0) return null;

  return (
    <select
      value=""
      onChange={(e) => {
        const t = templates.find((x) => x.name === e.target.value);
        if (t) onInsert(t.body);
      }}
      className="border rounded px-2 py-1 text-sm"
      data-testid="prompt-template-picker"
    >
      <option value="">Insert template…</option>
      {templates.map((t) => (
        <option key={t.name} value={t.name}>{t.name}</option>
      ))}
    </select>
  );
}
