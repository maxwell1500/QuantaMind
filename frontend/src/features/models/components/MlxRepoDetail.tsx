import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../workspace/state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";
import { useHfModelCard } from "../hooks/useHfModelCard";
import { ModelCardSection } from "./card/ModelCardSection";

type Props = { repo: string; onBack: () => void };

// mlx_lm.server only serves text-generation LLMs. Anything else (TTS, embeddings,
// vision…) starts the HTTP server but can never answer a chat request.
const MLX_TASK = "text-generation";

/// MLX repos aren't downloaded file-by-file like GGUF — the repo *is* the
/// model, and `mlx_lm.server` fetches it on first start. So instead of a
/// variant table this routes the repo into the workspace's "Start MLX" control
/// (switching the active backend). A guardrail blocks repos whose task isn't
/// text-generation, since mlx_lm can't serve them.
export function MlxRepoDetail({ repo, onBack }: Props) {
  const setMlxRepo = useWorkspaceStore((s) => s.setMlxRepo);
  const setActiveBackend = useWorkspaceStore((s) => s.setActiveBackend);
  const goTo = useNavStore((s) => s.setTopView);
  const { card, status } = useHfModelCard(repo);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => setConfirmOpen(false), [repo]);

  const task = card?.pipeline_tag ?? null;
  // Only block when the task is known AND not text-generation — an absent tag
  // is treated as "maybe", so we don't false-block untagged LLM repos.
  const incompatible = status === "ready" && task != null && task !== MLX_TASK;

  const proceed = () => {
    setConfirmOpen(false);
    setMlxRepo(repo);
    setActiveBackend("mlx");
    goTo("workspace");
  };

  const onUse = () => (incompatible ? setConfirmOpen(true) : proceed());

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

      <p className="text-xs text-gray-500">
        MLX downloads the full repo on first launch — this can be several GB and
        take a few minutes. Needs <code>mlx-lm</code> installed
        (<code>pip install mlx-lm</code>).
      </p>
      <button
        type="button"
        onClick={onUse}
        data-testid="mlx-use-button"
        className="self-start rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
      >
        Use in MLX
      </button>

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
                Use anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
