import { useEffect, useState } from "react";
import { listModels } from "../../../shared/ipc/client";

type Props = {
  value: string | null;
  onChange: (model: string) => void;
};

export function ModelPicker({ value, onChange }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div role="alert" className="text-red-600 text-sm">
        {error}
      </div>
    );
  }

  return (
    <select
      aria-label="Model"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1 text-sm"
    >
      <option value="" disabled>
        Pick a model
      </option>
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
