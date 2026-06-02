import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { EvalEditor } from "./EvalEditor";
import { formatIpcError } from "../../../shared/ipc/core/error";

/// Choose the dataset to run the tool-call eval against — a read-only built-in
/// preset (Curated / Finance) or a user-authored collection — and manage custom
/// collections (new / edit / delete / import). Import passes only the file PATH.
export function DatasetBar() {
  const { presets, selected, collections, tasks, select, remove, importFile, isPreset } = useEvalRegistryStore();
  const [editing, setEditing] = useState<{ name: string; json: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCustom = !isPreset(selected);

  const guard = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const onImport = () =>
    guard(async () => {
      const picked = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (typeof picked === "string") await importFile(picked);
    });

  return (
    <div className="space-y-2" data-testid="dataset-bar">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selected}
          onChange={(e) => void guard(() => select(e.target.value))}
          data-testid="dataset-select"
          className="border rounded px-2 py-1 text-sm"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
          {collections.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="button" onClick={() => setEditing({ name: "", json: "[]" })} data-testid="dataset-new" className="px-2 py-1 rounded border text-sm">New</button>
        {isCustom && (
          <button type="button" onClick={() => setEditing({ name: selected, json: JSON.stringify(tasks, null, 2) })} data-testid="dataset-edit" className="px-2 py-1 rounded border text-sm">Edit</button>
        )}
        {isCustom && (
          <button type="button" onClick={() => void guard(() => remove(selected))} data-testid="dataset-delete" className="px-2 py-1 rounded border text-sm text-red-600">Delete</button>
        )}
        <button type="button" onClick={() => void onImport()} data-testid="dataset-import" className="px-2 py-1 rounded border text-sm">Import .json</button>
      </div>
      {error && (
        <p className="text-xs text-red-600" data-testid="dataset-error">{error}</p>
      )}
      {editing && (
        <EvalEditor initialName={editing.name} initialJson={editing.json} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
