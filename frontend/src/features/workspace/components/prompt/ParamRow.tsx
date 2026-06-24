import type { ParamInfo } from "./paramsInfo";

type Props = {
  info: ParamInfo;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
};

export function ParamRow({ info, value, onChange }: Props) {
  const parse = (raw: string) => {
    if (raw.trim() === "") return onChange(undefined);
    const n = info.integer ? parseInt(raw, 10) : parseFloat(raw);
    onChange(Number.isNaN(n) ? undefined : n);
  };
  const set = value ?? undefined;
  const fallback = Number(info.placeholder);
  const sliderValue = set ?? (Number.isFinite(fallback) ? fallback : info.min);
  return (
    <div className="flex items-center gap-2 py-1" data-testid={`param-${info.key}`}>
      <label className="w-28 text-xs text-gray-700 flex items-center gap-1" title={info.tooltip}>
        {info.label}
        <span className="text-gray-400 cursor-help" aria-label={`${info.label} help`}>ⓘ</span>
      </label>
      {info.slider && (
        <input
          type="range"
          min={info.min}
          max={info.max}
          step={info.step}
          value={sliderValue}
          onChange={(e) => parse(e.target.value)}
          className="flex-1"
          data-testid={`param-${info.key}-slider`}
        />
      )}
      <input
        type="number"
        inputMode={info.integer ? "numeric" : "decimal"}
        step={info.step}
        placeholder={info.placeholder}
        value={set ?? ""}
        onChange={(e) => parse(e.target.value)}
        className="w-20 border rounded px-1 py-0.5 text-xs"
        data-testid={`param-${info.key}-input`}
      />
      <button
        type="button"
        onClick={() => onChange(undefined)}
        disabled={set === undefined}
        className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
        title="Reset to default"
        aria-label={`Reset ${info.label}`}
      >
        ↺
      </button>
    </div>
  );
}
