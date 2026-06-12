import { useEffect, useState } from "react";
import { hfModelCard, type ModelCard } from "../../../shared/ipc/models/hf_browse";

export type CardStatus = "loading" | "ready" | "none" | "error";

/// Fetch a repo's structured model card. `none` = the repo has no README (not
/// an error).
export function useHfModelCard(repo: string): { card: ModelCard | null; status: CardStatus } {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [status, setStatus] = useState<CardStatus>("loading");
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setCard(null);
    hfModelCard(repo)
      .then((c) => {
        if (cancelled) return;
        if (c == null) setStatus("none");
        else {
          setCard(c);
          setStatus("ready");
        }
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [repo]);
  return { card, status };
}
