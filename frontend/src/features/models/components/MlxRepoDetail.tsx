import { useWorkspaceStore } from "../../workspace/state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";
import { ModelCardSection } from "./card/ModelCardSection";

type Props = { repo: string; onBack: () => void };

/// MLX repos aren't downloaded file-by-file like GGUF — the repo *is* the
/// model, and `mlx_lm.server` fetches it on first start. So instead of a
/// variant table this routes the repo into the workspace's "Start MLX" control
/// (switching the active backend) and lets the user start it there.
export function MlxRepoDetail({ repo, onBack }: Props) {
  const setMlxRepo = useWorkspaceStore((s) => s.setMlxRepo);
  const setActiveBackend = useWorkspaceStore((s) => s.setActiveBackend);
  const goTo = useNavStore((s) => s.setTopView);

  const useInMlx = () => {
    setMlxRepo(repo);
    setActiveBackend("mlx");
    goTo("workspace");
  };

  return (
    <div data-testid="mlx-repo-detail" className="flex flex-col gap-3 h-full">
      <button type="button" onClick={onBack} className="self-start text-xs underline">
        ← Back to search
      </button>
      <div className="text-sm font-medium break-all">{repo}</div>
      <ModelCardSection repo={repo} />
      <p className="text-xs text-gray-500">
        MLX downloads the full repo on first launch — this can be several GB and
        take a few minutes. Needs <code>mlx-lm</code> installed
        (<code>pip install mlx-lm</code>).
      </p>
      <button
        type="button"
        onClick={useInMlx}
        data-testid="mlx-use-button"
        className="self-start rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
      >
        Use in MLX
      </button>
    </div>
  );
}
