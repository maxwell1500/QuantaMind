import { useEffect, useState } from "react";
import { getOllamaEndpoint, setOllamaEndpoint } from "../../../shared/ipc/settings/userSettings";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";

export function OllamaEndpointSection() {
  const [endpoint, setEndpoint] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const refresh = useInstalledModelsStore((s) => s.refresh);

  useEffect(() => {
    getOllamaEndpoint()
      .then((ep) => setEndpoint(ep))
      .catch((e) => console.error("ollama endpoint load failed:", e))
      .finally(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setOllamaEndpoint(endpoint.trim());
      await refresh();
    } catch (e) {
      console.error("ollama endpoint save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl space-y-2" data-testid="ollama-endpoint-section">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
        Ollama endpoint
      </h2>
      <p className="text-xs text-gray-500">
        Default is <code className="text-[11px] bg-gray-100 px-1 rounded">http://localhost:11434</code>.
        Set a custom host if Ollama runs on another machine.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="http://localhost:11434"
          className="flex-1 text-sm border rounded px-2 py-1"
          data-testid="ollama-endpoint-input"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs border rounded px-3 py-1 disabled:opacity-50 hover:bg-gray-50"
          data-testid="ollama-endpoint-save"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
