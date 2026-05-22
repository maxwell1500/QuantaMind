import { useLocalImport } from "../../hooks/useLocalImport";
import { LocalFilePreview } from "../LocalFilePreview";

export function LocalFileTab() {
  const s = useLocalImport();

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
        error={s.error}
        conflict={s.conflict}
      />
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
      {s.error && (
        <div role="alert" data-testid="local-error" className="text-red-600 text-xs">
          {s.error}
        </div>
      )}
    </div>
  );
}
