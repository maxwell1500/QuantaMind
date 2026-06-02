import { useEffect, useState } from "react";
import { hfModelCard } from "../../../shared/ipc/models/hf_browse";

export type CardStatus = "loading" | "ready" | "none" | "error";

/// Fetch a repo's model card. `none` = the repo has no README (not an error).
export function useHfModelCard(repo: string): { markdown: string | null; status: CardStatus } {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [status, setStatus] = useState<CardStatus>("loading");
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setMarkdown(null);
    hfModelCard(repo)
      .then((md) => {
        if (cancelled) return;
        if (md == null) setStatus("none");
        else {
          setMarkdown(md);
          setStatus("ready");
        }
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [repo]);
  return { markdown, status };
}
