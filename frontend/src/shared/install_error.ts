/// Translate a raw IPC install error (AppError shape `{kind, message}`
/// or a plain string) into a UI-facing explanation with a next step
/// the user can act on. The raw `formatIpcError` output is diagnostic;
/// this one is for the user. Callers wire this into the install hooks
/// (`useHfInstall`, `useModelInstall`) where the error renders in the
/// AddModelModal.

type IpcErr = { kind?: string; message?: string };

function parseErr(raw: unknown): { kind: string; msg: string } {
  if (typeof raw === "string") return { kind: "", msg: raw };
  if (raw && typeof raw === "object") {
    const e = raw as IpcErr;
    return { kind: String(e.kind ?? ""), msg: String(e.message ?? "") };
  }
  return { kind: "", msg: String(raw ?? "") };
}

export function friendlyInstallError(raw: unknown): string {
  const { kind, msg } = parseErr(raw);
  const lower = msg.toLowerCase();

  if (lower.includes("connection refused") || lower.includes("os error 61")
      || lower.includes("error trying to connect")) {
    return "Ollama isn't running. Start Ollama and try again.";
  }
  if (kind === "auth_required") {
    return "This Hugging Face repo is gated. Approve access on huggingface.co — QuantaMind doesn't carry HF tokens yet.";
  }
  if (lower.includes("rate limited") || lower.includes("http 429")) {
    return "Hugging Face is rate-limiting requests. Wait a minute and try again.";
  }
  if (lower.includes("invalid model name")) {
    return "Ollama rejected this model's name (its name parser is strict on length/format). Try a different variant or a more standardly-named repo.";
  }
  if (kind === "not_found" || lower.includes("manifest unknown")
      || lower.includes("file does not exist") || lower.includes("model not found")) {
    return "That model wasn't found. Double-check the name and tag — `ollama.com/library/<model>` lists the valid tags.";
  }
  if (lower.includes("big-endian") || lower.includes("bad magic")
      || lower.includes("invalid gguf") || lower.includes("unsupported quant")
      || lower.includes("unsupported architecture")) {
    return "Ollama couldn't load this GGUF. It looks corrupted, big-endian, or an unsupported format/architecture. Try a different variant.";
  }
  if (kind === "timeout" || lower.includes("timed out")) {
    return "The install timed out. Check your network and try again.";
  }
  if (lower.includes("stream ended without success")) {
    return "Ollama accepted the upload but never confirmed the model was registered — this usually means the file is a projection / adapter / LoRA fragment (e.g. mmproj-*) rather than a standalone model. Look for a full-model variant in the same repo.";
  }
  if (lower.includes("silently rolled back") || lower.includes("not in /api/tags")) {
    return "Ollama said the install succeeded but the model didn't actually register — it silently rolled back. The GGUF may be malformed, the architecture unsupported, or your Ollama version may need an upgrade. Check `~/.ollama/logs/server.log` for the real reason.";
  }
  if (lower.includes("create http 400") || lower.includes("create http 422")) {
    return `Ollama rejected the model definition: ${msg.split(": ").slice(-1)[0] ?? msg}`;
  }
  if (lower.startsWith("create http") || lower.startsWith("blob upload http")) {
    return `Ollama rejected the install request — ${msg}`;
  }
  if (lower.includes("hf http") || lower.includes("hf rate")) {
    return `Hugging Face returned an error — ${msg}`;
  }
  return msg || "Install failed for an unknown reason.";
}
