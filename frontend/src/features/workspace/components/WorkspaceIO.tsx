import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StoredPrompt } from "../../../shared/ipc/types";

type Props = {
  model: string | null;
  prompt: string;
  onLoad: (model: string, prompt: string) => void;
};

const DEFAULT_PATH = "./quantamind-current.yaml";

export function WorkspaceIO({ model, prompt, onLoad }: Props) {
  const [path, setPath] = useState(DEFAULT_PATH);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    if (!model) {
      setMsg("pick a model first");
      return;
    }
    try {
      await invoke("save_prompt", { path, model, prompt });
      setMsg(`saved ${path}`);
    } catch (e) {
      setMsg(String(e));
    }
  };

  const load = async () => {
    try {
      const result = await invoke<StoredPrompt>("load_prompt", { path });
      onLoad(result.model, result.prompt);
      setMsg(`loaded ${path}`);
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        aria-label="File path"
        className="border rounded px-2 py-1 text-sm flex-1"
        value={path}
        onChange={(e) => setPath(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        className="px-3 py-1 rounded border text-sm"
      >
        Save
      </button>
      <button
        type="button"
        onClick={load}
        className="px-3 py-1 rounded border text-sm"
      >
        Load
      </button>
      {msg && (
        <span className="text-xs text-gray-500" data-testid="io-msg">
          {msg}
        </span>
      )}
    </div>
  );
}
