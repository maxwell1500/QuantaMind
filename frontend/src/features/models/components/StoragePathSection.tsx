import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getStoragePath,
  validateStoragePath,
  type PathValidation,
  type StoragePathInfo,
} from "../../../shared/ipc/settings";
import { formatBytes } from "../format";

export function StoragePathSection() {
  const [info, setInfo] = useState<StoragePathInfo | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [check, setCheck] = useState<PathValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStoragePath().then(setInfo).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const browse = async () => {
    setError(null);
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    setCandidate(picked);
    try {
      setCheck(await validateStoragePath(picked));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!info) return <div className="text-xs text-gray-500">Loading storage settings…</div>;

  const ok = check && check.exists && check.is_dir && check.writable && check.sufficient;

  return (
    <section data-testid="storage-path-section" className="border rounded p-3 flex flex-col gap-2">
      <div className="text-sm font-medium">Model storage path</div>
      <div className="text-xs text-gray-600" data-testid="storage-path-current">
        {info.current_path}
        {info.from_env && <span className="ml-2 text-amber-700">(from $OLLAMA_MODELS)</span>}
      </div>
      <button type="button" onClick={browse} className="self-start text-xs border rounded px-2 py-1">
        Change…
      </button>
      {error && <div role="alert" className="text-red-600 text-xs">{error}</div>}
      {candidate && check && (
        <div data-testid="storage-path-validation" className="text-xs flex flex-col gap-1">
          <div>Candidate: <code>{candidate}</code></div>
          <div>
            {!check.exists && <span className="text-red-600">Path does not exist. </span>}
            {check.exists && !check.is_dir && <span className="text-red-600">Not a directory. </span>}
            {check.is_dir && !check.writable && <span className="text-red-600">Not writable by you. </span>}
            {check.is_dir && check.writable && (
              <>
                {formatBytes(check.free_bytes)} free of {formatBytes(check.total_bytes)}.{" "}
                {!check.sufficient && <span className="text-amber-700">Less than 50GB free — typical 7B models are 4–8GB each.</span>}
                {check.sufficient && <span className="text-green-700">Sufficient space.</span>}
              </>
            )}
          </div>
          {ok && (
            <div className="mt-1 text-gray-700">
              To make this permanent, add to your shell profile and restart Ollama:
              <pre className="bg-gray-100 rounded px-2 py-1 mt-1 text-[11px]">{`export OLLAMA_MODELS="${candidate}"\npkill ollama && ollama serve`}</pre>
              Quatamind will not move existing models — re-pull them at the new path or move the blobs manually.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
