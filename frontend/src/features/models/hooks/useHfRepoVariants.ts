import { useEffect, useState } from "react";
import { hfRepoFiles, type HfRepoFile } from "../../../shared/ipc/hf_browse";
import { formatIpcError } from "../../../shared/ipc/error";
import { parseQuant } from "../parse_quant";

export type HfVariantView = {
  filename: string;
  quantization: string;
  sizeBytes: number;
};
export type VariantStatus = "loading" | "ready" | "error";

const toVariant = (f: HfRepoFile): HfVariantView => ({
  filename: f.path,
  quantization: parseQuant(f.path) ?? "unknown",
  sizeBytes: f.size_bytes,
});

/// Loads the GGUF variant list for one HF repo via `hf_repo_files` and
/// projects each file into a view with the parsed quantization label.
/// `refetch` re-runs the call (e.g. after a retry click).
export function useHfRepoVariants(repo: string) {
  const [variants, setVariants] = useState<HfVariantView[]>([]);
  const [status, setStatus] = useState<VariantStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading"); setError(null);
    hfRepoFiles(repo)
      .then((files) => {
        if (cancelled) return;
        setVariants(files.map(toVariant));
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(formatIpcError(e));
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [repo, nonce]);

  return { variants, status, error, refetch: () => setNonce((n) => n + 1) };
}
