import { useEffect, useState } from "react";
import { useCompareStore } from "../../state/compareStore";
import {
  listBenchConfigs, loadBenchConfig, saveBenchConfig,
  type BenchEntry,
} from "../../../../shared/ipc/bench/bench_config";
import { formatIpcError } from "../../../../shared/ipc/core/error";

export function BenchConfigBar() {
  const s = useCompareStore();
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<BenchEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    listBenchConfigs().then(setEntries).catch(() => setEntries([]));
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setError(null);
    try {
      await saveBenchConfig(name.trim(), {
        name: name.trim(), strategy: s.strategy,
        system: s.systemPrompt, user: s.prompt,
        models: s.selectedModels.map((m) => ({ name: m.name, size_bytes: m.size_bytes })),
        created_at: "", updated_at: "",
      });
      setName("");
      refresh();
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const load = async (path: string) => {
    if (!path) return;
    setError(null);
    try {
      const c = await loadBenchConfig(path);
      s.setSelectedModels(c.models.map((m) => ({ name: m.name, size_bytes: m.size_bytes })));
      s.setStrategy(c.strategy === "parallel" ? "parallel" : "sequential");
      s.setSystemPrompt(c.system);
      s.setPrompt(c.user);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="bench-config-bar">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Config name…"
        className="border rounded px-2 py-1 text-sm"
        data-testid="bench-config-name"
      />
      <button
        onClick={save}
        disabled={!name.trim()}
        className="border rounded px-2 py-1 disabled:opacity-40"
        data-testid="bench-config-save"
      >Save config</button>
      <select
        onChange={(e) => load(e.target.value)}
        value=""
        className="border rounded px-2 py-1"
        data-testid="bench-config-load"
      >
        <option value="">Load config…</option>
        {entries.map((e) => <option key={e.path} value={e.path}>{e.name}</option>)}
      </select>
      {error && <span className="text-xs text-red-600" data-testid="bench-config-error">{error}</span>}
    </div>
  );
}
