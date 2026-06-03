import { useEffect, useState } from "react";
import { useHfModelCard } from "../hooks/useHfModelCard";
import { useMlxInstall } from "../hooks/useMlxInstall";
import { useHardwareSnapshot } from "../hooks/useHardwareSnapshot";
import { useInstalledModelsStore } from "../state/installedModelsStore";
import { hfRepoAllFiles } from "../../../shared/ipc/models/hf_browse";
import { formatBytes } from "../../../shared/format/bytes";
import { memoryFit, fitBadge } from "../fit";
import { ModelCardSection } from "./card/ModelCardSection";
import { HfInstallStatus } from "./HfInstallStatus";

type Props = { repo: string; onBack: () => void };

// mlx_lm.server only serves text-generation LLMs. Anything else (TTS, embeddings,
// vision…) downloads gigabytes and then can't answer a chat request.
const MLX_TASK = "text-generation";

// Base/pretrained checkpoints (e.g. `…-pt`, `…-base`) aren't instruction-tuned,
// so they won't follow a chat prompt — they just continue text. Heuristic on the
// repo id; we warn (not block) and point at the instruct variant.
const looksLikeBaseModel = (repo: string) => /[-_/](pt|base)([-_].*)?$|[-_]pt[-_]/i.test(repo);

/// MLX repos download as a full local snapshot (into ~/.quantamind/mlx); the
/// model then appears in the Workspace dropdown to select and Start. A guardrail
/// blocks repos whose task isn't text-generation, since mlx_lm can't serve them.
export function MlxRepoDetail({ repo, onBack }: Props) {
  const { card, status } = useHfModelCard(repo);
  const { state, install, cancel, reset } = useMlxInstall();
  const { snapshot } = useHardwareSnapshot();
  const alreadyInstalled = useInstalledModelsStore((s) =>
    s.list.some((m) => m.backend === "mlx" && m.display_name === repo),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);

  useEffect(() => setConfirmOpen(false), [repo]);

  // Total download size (sum of the snapshot's files) so the user can judge fit
  // before pulling gigabytes. Null while loading / on failure (we just omit it).
  useEffect(() => {
    let cancelled = false;
    setSizeBytes(null);
    hfRepoAllFiles(repo)
      .then((files) => !cancelled && setSizeBytes(files.reduce((n, f) => n + f.size_bytes, 0)))
      .catch(() => !cancelled && setSizeBytes(null));
    return () => { cancelled = true; };
  }, [repo]);

  const task = card?.pipeline_tag ?? null;
  // Only block when the task is known AND not text-generation — an absent tag
  // is treated as "maybe", so we don't false-block untagged LLM repos.
  const incompatible = status === "ready" && task != null && task !== MLX_TASK;
  const isBase = looksLikeBaseModel(repo);
  const fit = sizeBytes != null && snapshot
    ? fitBadge(memoryFit(sizeBytes, snapshot.available_memory_bytes))
    : null;
  const busy = state.status === "downloading";

  const proceed = () => {
    setConfirmOpen(false);
    void install(repo);
  };
  const onDownload = () => (incompatible ? setConfirmOpen(true) : proceed());

  return (
    <div data-testid="mlx-repo-detail" className="flex flex-col gap-3 h-full">
      <button type="button" onClick={onBack} className="self-start text-xs underline">
        ← Back to search
      </button>
      <div className="text-sm font-medium break-all">{repo}</div>
      <ModelCardSection repo={repo} />

      {incompatible && (
        <div
          role="alert"
          data-testid="mlx-incompatible-banner"
          className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
        >
          This is a <strong>{task}</strong> model. The MLX server (<code>mlx_lm</code>) only runs{" "}
          <strong>text-generation</strong> models, so it can't serve this one — pick a chat/instruct
          MLX model instead (e.g. <code>mlx-community/…-Instruct-…</code>).
        </div>
      )}

      {isBase && !incompatible && (
        <div
          data-testid="mlx-base-banner"
          className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
        >
          This looks like a <strong>base / pretrained</strong> model — it won't follow chat prompts
          and may return nothing. Prefer an <strong>instruction-tuned</strong> variant (look for{" "}
          <code>-it</code> or <code>Instruct</code> in the name).
        </div>
      )}

      {/* Download size + does-it-fit estimate, so the user judges before pulling GBs. */}
      <p className="text-xs text-gray-500" data-testid="mlx-size">
        Download size:{" "}
        {sizeBytes != null ? <strong>{formatBytes(sizeBytes)}</strong> : "…"}
        {fit && <span className={`ml-2 ${fit.cls}`} data-testid="mlx-fit">{fit.text}</span>}
        <br />
        Full snapshot to your machine — then select it in the Workspace and Start MLX.
        Running needs <code>mlx-lm</code> (<code>pip install mlx-lm</code>).
      </p>

      {alreadyInstalled && state.status === "idle" ? (
        <div data-testid="mlx-already-installed" className="text-green-700 text-xs">
          Downloaded ✓ — select it in the Workspace dropdown and Start MLX.
        </div>
      ) : (
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          data-testid="mlx-download-button"
          className="self-start rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Download for MLX
        </button>
      )}
      <HfInstallStatus state={state} onCancel={cancel} onReset={reset} />

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Incompatible model"
            data-testid="mlx-incompatible-dialog"
            className="bg-surface rounded-lg shadow-xl w-96 max-w-[90vw] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold mb-2">This model won't run on MLX</h2>
            <p className="text-sm text-gray-700 mb-3">
              <span className="break-all font-medium">{repo}</span> is a{" "}
              <strong>{task}</strong> model. QuantaMind's MLX server (<code>mlx_lm</code>) only
              serves <strong>text-generation</strong> LLMs, so this would download gigabytes and
              then fail to answer. Choose an instruct/chat MLX model instead.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                data-testid="mlx-incompatible-cancel"
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Pick another
              </button>
              <button
                type="button"
                onClick={proceed}
                data-testid="mlx-incompatible-proceed"
                className="rounded border border-amber-400 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-50"
              >
                Download anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
