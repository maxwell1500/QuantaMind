import { PARAMS } from "./paramsInfo";
import { ParamRow } from "./ParamRow";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useCompareStore } from "../../../compare/state/compareStore";

/// A compact per-model parameter editor, seeded from the shared prompt params
/// and stored under compareStore.perModelParams[model].
export function ModelParamCard({ model }: { model: string }) {
  const base = useWorkspacesStore((s) => s.current?.params);
  const override = useCompareStore((s) => s.perModelParams[model]);
  const setModelParams = useCompareStore((s) => s.setModelParams);
  const params = override ?? base ?? {};

  return (
    <div className="border rounded p-2 min-w-[260px]" data-testid={`model-params-${model}`}>
      <div className="text-xs font-medium text-gray-700 truncate">{model}</div>
      {PARAMS.map((info) => (
        <ParamRow
          key={info.key}
          info={info}
          value={params[info.key]}
          onChange={(v) => setModelParams(model, { ...params, [info.key]: v })}
        />
      ))}
    </div>
  );
}
