import { useState } from "react";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { PARAMS } from "./paramsInfo";
import { ParamRow } from "./ParamRow";

type Props = { running: boolean };

export function ParamsPanel({ running }: Props) {
  const current = useWorkspacesStore((s) => s.current);
  const patch = useWorkspacesStore((s) => s.patch);
  const [open, setOpen] = useState(false);
  if (!current) return null;
  const params = current.params;

  return (
    <div className="border rounded" data-testid="params-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <span>Parameters {running && <span className="text-amber-600">· applies on next run</span>}</span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          {PARAMS.map((info) => (
            <ParamRow
              key={info.key}
              info={info}
              value={params[info.key]}
              onChange={(v) => patch({ params: { ...params, [info.key]: v } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
