import { ErrorCard } from "../../../../shared/ui/ErrorCard";
import { classifyError } from "../../../../shared/ipc/core/errorInfo";
import { useNavStore } from "../../../../shared/state/navStore";

type Props = { error: string; onRetry: () => void };

export function WorkspaceError({ error, onRetry }: Props) {
  const info = classifyError(error);
  const setView = useNavStore((s) => s.setTopView);
  const action =
    info.actionHint === "open_models"
      ? { label: "Open Models", onClick: () => setView("models") }
      : { label: "Retry", onClick: onRetry };
  return (
    <ErrorCard title={info.title} body={info.body} learnMore={info.learnMore} action={action} />
  );
}
