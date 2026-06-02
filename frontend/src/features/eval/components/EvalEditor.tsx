import { useState } from "react";
import { z } from "zod";
import { ToolTaskSchema } from "../../../shared/ipc/eval/registry";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { formatIpcError } from "../../../shared/ipc/core/error";

const ArraySchema = z.array(ToolTaskSchema).min(1);

/// One valid task per shape (call / parallel / no_call) so authors never guess
/// the layout — including the nested JSON-Schema `parameters` block.
const EXAMPLE = JSON.stringify(
  [
    {
      id: "weather-paris", category: "single", prompt: "What's the weather in Paris?",
      tools: [{ name: "get_weather", description: "Get the current weather for a city", parameters: { type: "object", properties: { city: { type: "string", description: "City name" } }, required: ["city"] } }],
      expected: { type: "call", name: "get_weather", args: { city: "Paris" } },
    },
    {
      id: "weather-two", category: "parallel", prompt: "Weather in Paris and Tokyo?",
      tools: [{ name: "get_weather", description: "Get the current weather for a city", parameters: { type: "object", properties: { city: { type: "string", description: "City name" } }, required: ["city"] } }],
      expected: { type: "parallel", calls: [{ name: "get_weather", args: { city: "Paris" } }, { name: "get_weather", args: { city: "Tokyo" } }] },
    },
    {
      id: "abstain-knowledge", category: "abstain", prompt: "What is the capital of France?",
      tools: [{ name: "get_weather", description: "Get the current weather for a city", parameters: { type: "object", properties: { city: { type: "string", description: "City name" } }, required: ["city"] } }],
      expected: { type: "no_call" },
    },
  ],
  null,
  2,
);

/// Author or edit a collection: a name + the tasks as a JSON array. "Insert
/// Example" seeds a valid template; "Check JSON" runs the Zod schema (UX only —
/// the backend re-validates on save). Save is blocked on invalid input.
export function EvalEditor({ initialName, initialJson, onClose }: { initialName: string; initialJson: string; onClose: () => void }) {
  const save = useEvalRegistryStore((s) => s.save);
  const [name, setName] = useState(initialName);
  const [json, setJson] = useState(initialJson);
  const [check, setCheck] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const validate = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      setOk(false);
      setCheck(`Invalid JSON: ${(e as Error).message}`);
      return null;
    }
    const r = ArraySchema.safeParse(parsed);
    if (!r.success) {
      setOk(false);
      setCheck(r.error.issues[0] ? `${r.error.issues[0].path.join(".")}: ${r.error.issues[0].message}` : "Schema error");
      return null;
    }
    setOk(true);
    setCheck(`✓ ${r.data.length} task(s) valid`);
    return r.data;
  };

  const onSave = async () => {
    const tasks = validate();
    if (!tasks || !name.trim()) return;
    try {
      await save(name.trim(), tasks);
      onClose();
    } catch (e) {
      setOk(false);
      setCheck(`Save failed — ${formatIpcError(e)}`);
    }
  };

  return (
    <div className="space-y-2 border rounded p-2 bg-gray-50" data-testid="eval-editor">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Collection name"
        data-testid="eval-editor-name"
        className="border rounded px-2 py-1 text-sm w-full"
      />
      <textarea
        value={json}
        onChange={(e) => { setJson(e.target.value); setOk(false); setCheck(null); }}
        spellCheck={false}
        data-testid="eval-editor-json"
        className="border rounded px-2 py-1 text-xs font-mono w-full h-48"
      />
      {check && (
        <p className={`text-xs ${ok ? "text-green-700" : "text-red-600"}`} data-testid="eval-editor-check">{check}</p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setJson(EXAMPLE); setOk(false); setCheck(null); }} data-testid="eval-editor-example" className="px-2 py-1 rounded border text-sm">Insert Example</button>
        <button type="button" onClick={validate} data-testid="eval-editor-check-btn" className="px-2 py-1 rounded border text-sm">Check JSON</button>
        <button type="button" onClick={() => void onSave()} disabled={!name.trim()} data-testid="eval-editor-save" className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50">Save</button>
        <button type="button" onClick={onClose} data-testid="eval-editor-cancel" className="px-2 py-1 rounded border text-sm">Cancel</button>
      </div>
    </div>
  );
}
