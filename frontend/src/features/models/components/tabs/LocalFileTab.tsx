import { useLocalImport } from "../../hooks/useLocalImport";
import { LocalFilePreview, ImportError } from "../LocalFilePreview";
import { useModelStore } from "../../state/modelStore";

export function LocalFileTab() {
  const s = useLocalImport();
  const activeLocalName = useModelStore((st) => st.activeLocalName);

  if (s.path && s.meta) {
    return (
      <LocalFilePreview
        path={s.path}
        meta={s.meta}
        name={s.name}
        onNameChange={s.setName}
        onImport={s.doImport}
        onCancel={s.cancel}
        busy={s.busy}
        percent={s.percent}
        phaseLabel={s.phaseLabel}
        error={s.error}
        conflict={s.conflict}
      />
    );
  }

  if (s.busy && activeLocalName) {
    return (
      <div data-testid="local-in-progress" className="border rounded p-3 flex flex-col gap-2">
        <div className="text-xs text-gray-500">Importing</div>
        <div className="text-sm font-medium">{activeLocalName}</div>
        <div className="flex items-center gap-2 text-xs">
          <progress value={s.percent} max={100} className="flex-1 h-2" />
          <span className="tabular-nums w-24 text-right">
            {s.phaseLabel ? `${s.phaseLabel} ${s.percent}%` : `${s.percent}%`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tab-local" className="flex flex-col gap-3 h-full">
      <div className="border-2 border-dashed rounded h-40 flex items-center justify-center text-sm text-gray-500">
        Drag a .gguf file onto the window, or browse below.
      </div>
      <button
        type="button"
        onClick={s.browse}
        className="self-start text-xs border rounded px-3 py-1"
      >
        Browse files…
      </button>
      {s.error && <ImportError message={s.error} testid="local-error" />}
    </div>
  );
}
