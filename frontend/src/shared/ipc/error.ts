function friendly(msg: string): string {
  if (msg.includes("Connection refused")
      || msg.includes("error trying to connect")
      || msg.includes("os error 61")
      || msg.includes("tcp connect error")) {
    return "Ollama is not running. Start Ollama and try again.";
  }
  return msg;
}

export function formatIpcError(e: unknown): string {
  if (e instanceof Error) return friendly(e.message);
  if (typeof e === "string") return friendly(e);
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string") return friendly(m);
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
