import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEMPERATURE } from "../../../../shared/ipc/model_settings";
import { useModelSettingsStore } from "../../../models/state/modelSettingsStore";

type Props = { modelName: string | null };

export function ModelTemperaturePopover({ modelName }: Props) {
  const [open, setOpen] = useState(false);
  const persisted = useModelSettingsStore((s) =>
    modelName ? s.temperatureFor(modelName) : DEFAULT_TEMPERATURE,
  );
  const setTemperature = useModelSettingsStore((s) => s.setTemperature);
  const [draft, setDraft] = useState(persisted);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(persisted), [persisted, open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (value: number) => {
    setDraft(value);
    if (modelName) void setTemperature(modelName, value);
  };

  const disabled = !modelName;
  const readValue = (e: { target: EventTarget | null }) =>
    Number((e.target as HTMLInputElement).value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Model temperature"
        title={disabled ? "Pick a model first" : `Temperature ${persisted.toFixed(2)}`}
        className="border rounded p-1 text-sm hover:bg-gray-50 disabled:opacity-40"
        data-testid="model-temperature-button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && modelName && (
        <div role="dialog" aria-label="Temperature settings"
          className="absolute z-20 mt-1 left-0 w-64 border rounded bg-surface shadow p-3 space-y-2"
          data-testid="model-temperature-popover"
        >
          <div className="flex justify-between text-xs">
            <label htmlFor="temp-range" className="font-medium">Temperature</label>
            <span data-testid="model-temperature-value">{draft.toFixed(2)}</span>
          </div>
          <input
            id="temp-range" type="range" min={0} max={2} step={0.05}
            value={draft}
            onChange={(e) => setDraft(readValue(e))}
            onPointerUp={(e) => commit(readValue(e))}
            onKeyUp={(e) => commit(readValue(e))}
            className="w-full"
            aria-label="Temperature"
          />
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>0 deterministic</span>
            <span>2 chaotic</span>
          </div>
          <button
            type="button"
            onClick={() => commit(DEFAULT_TEMPERATURE)}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
            data-testid="model-temperature-reset"
          >
            Reset to {DEFAULT_TEMPERATURE}
          </button>
        </div>
      )}
    </div>
  );
}
